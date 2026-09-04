import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { builtInTemplates } from '@main/llm/templates';
import { LLMProviderError } from '@main/llm/types';
import type { LLMProvider, LLMRequest, LLMResponse } from '@main/llm/types';
import { RecordingRepository } from '@main/repositories/recordingRepository';
import { AIArtifactService } from '@main/services/aiArtifactService';
import { FileImportService } from '@main/services/fileImportService';

let tmpDir = '';
let dbManager: DatabaseManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-ai-artifact-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('AIArtifactService', () => {
  it('generates an AI artifact from an existing transcript', async () => {
    const { repository, recordingId } = await createRecordingWithTranscript();
    const service = new AIArtifactService(repository, new SuccessfulLLM(), mockSettings());

    const detail = await service.generateArtifact(recordingId);

    expect(detail.processingState).toBe('succeeded');
    expect(detail.latestArtifact?.provider).toBe('mock');
    expect(detail.latestArtifact?.model).toBe('deepseek-chat');
    expect(detail.latestArtifact?.promptVersion).toBe(builtInTemplates[0].promptVersion);
    expect(detail.latestArtifact?.content.title).toBe('结构化笔记');
    expect(detail.jobs.find((job) => job.kind === 'ai')?.state).toBe('succeeded');
    expect(repository.search('结构化').map((item) => item.id)).toContain(recordingId);
  });

  it('starts AI generation in the background', async () => {
    const { repository, recordingId } = await createRecordingWithTranscript();
    const service = new AIArtifactService(repository, new DelayedLLM(), mockSettings());

    const started = service.startGeneration(recordingId);
    const runningJob = started.jobs.find((job) => job.kind === 'ai' && job.state === 'running');

    expect(runningJob).toBeDefined();
    const detail = await waitForAIJob(repository, recordingId, runningJob?.id ?? '');
    expect(detail.latestArtifact?.content.summary).toContain('后台');
  });

  it('keeps all generated AI artifacts in newest-first history', async () => {
    const { repository, recordingId } = await createRecordingWithTranscript();
    const service = new AIArtifactService(repository, new TemplateEchoLLM(), mockSettings());

    await service.generateArtifact(recordingId, 'default-summary');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const detail = await service.generateArtifact(recordingId, 'technical-thinking');

    expect(detail.latestArtifact?.templateId).toBe('technical-thinking');
    expect(detail.artifacts.map((artifact) => artifact.templateId)).toEqual([
      'technical-thinking',
      'default-summary'
    ]);
  });

  it('requires a transcript before generating AI notes', async () => {
    const db = dbManager.open();
    const repository = new RecordingRepository(db);
    repository.ensureBuiltInTemplates([...builtInTemplates]);
    const importer = new FileImportService(repository, async () => ({ duration: 8, format: 'M4A' }));
    const filePath = path.join(tmpDir, '没有转写.m4a');
    fs.writeFileSync(filePath, Buffer.from('fake-audio'));
    const imported = await importer.importFile(filePath);
    const service = new AIArtifactService(repository, new SuccessfulLLM(), mockSettings());

    await expect(service.generateArtifact(imported.recording.id)).rejects.toThrow('需要先完成转写');

    const detail = repository.getRecording(imported.recording.id);
    expect(detail?.jobs.some((job) => job.kind === 'ai')).toBe(false);
  });

  it('stores raw provider responses on failed AI jobs', async () => {
    const { repository, recordingId } = await createRecordingWithTranscript();
    const service = new AIArtifactService(repository, new InvalidResponseLLM(), mockSettings());

    await expect(service.generateArtifact(recordingId)).rejects.toThrow('不符合 schema');

    const detail = repository.getRecording(recordingId);
    const job = detail?.jobs.find((item) => item.kind === 'ai');
    expect(job?.state).toBe('failed');
    expect(job?.errorDetail).toBe('{"summary":"缺少标题"}');
  });
});

class SuccessfulLLM implements LLMProvider {
  readonly id = 'mock';

  async generate(_request: LLMRequest): Promise<LLMResponse> {
    return {
      rawResponse: '{"title":"结构化笔记"}',
      content: {
        title: '结构化笔记',
        summary: '已经从 transcript 生成结构化 AI 笔记。',
        keyPoints: ['保留原始 transcript'],
        todos: ['继续验证 UI'],
        tags: ['ai']
      }
    };
  }
}

class DelayedLLM implements LLMProvider {
  readonly id = 'mock';

  async generate(_request: LLMRequest): Promise<LLMResponse> {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      rawResponse: '',
      content: {
        title: '后台笔记',
        summary: '后台 AI 笔记生成完成。',
        keyPoints: ['ProcessingJob running 状态可见'],
        todos: [],
        tags: ['background']
      }
    };
  }
}

class TemplateEchoLLM implements LLMProvider {
  readonly id = 'mock';

  async generate(request: LLMRequest): Promise<LLMResponse> {
    return {
      rawResponse: `{"title":"${request.templateId}"}`,
      content: {
        title: request.templateId,
        summary: `整理自 ${request.templateId}。`,
        keyPoints: [request.templateId],
        todos: [],
        tags: [request.templateId]
      }
    };
  }
}

class InvalidResponseLLM implements LLMProvider {
  readonly id = 'mock';

  async generate(_request: LLMRequest): Promise<LLMResponse> {
    throw new LLMProviderError('DeepSeek 返回的笔记 JSON 不符合 schema。', {
      rawResponse: '{"summary":"缺少标题"}'
    });
  }
}

async function createRecordingWithTranscript() {
  const db = dbManager.open();
  const repository = new RecordingRepository(db);
  repository.ensureBuiltInTemplates([...builtInTemplates]);
  const importer = new FileImportService(repository, async () => ({ duration: 8, format: 'M4A' }));
  const filePath = path.join(tmpDir, '需要总结.m4a');
  fs.writeFileSync(filePath, Buffer.from('fake-audio'));
  const imported = await importer.importFile(filePath);

  repository.addTranscript(imported.recording.id, {
    language: 'zh',
    duration: 8,
    fullText: '我今天想把语音转写整理成结构化笔记，并且保留原始 transcript。',
    segments: [
      {
        id: 'ignored',
        transcriptId: 'ignored',
        startTime: 0,
        endTime: 8,
        text: '我今天想把语音转写整理成结构化笔记，并且保留原始 transcript。'
      }
    ]
  });

  return { repository, recordingId: imported.recording.id };
}

function mockSettings() {
  return {
    getSettings: () => ({ deepSeekModel: 'deepseek-chat' })
  };
}

async function waitForAIJob(repository: RecordingRepository, recordingId: string, jobId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const detail = repository.getRecording(recordingId);
    const job = detail?.jobs.find((item) => item.id === jobId);
    if (detail?.latestArtifact && job?.state === 'succeeded') {
      return detail;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for AI artifact job.');
}
