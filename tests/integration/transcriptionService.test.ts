import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { RecordingRepository } from '@main/repositories/recordingRepository';
import { FileImportService } from '@main/services/fileImportService';
import { TranscriptionService } from '@main/services/transcriptionService';
import type { SpeechToTextResult, SpeechToTextService } from '@main/stt/types';

let tmpDir = '';
let dbManager: DatabaseManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-transcription-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('TranscriptionService', () => {
  it('writes transcript segments and marks jobs as succeeded', async () => {
    const repository = new RecordingRepository(dbManager.open());
    const importer = new FileImportService(repository, async () => ({ duration: 6, format: 'M4A' }));
    const filePath = path.join(tmpDir, '语音转写.m4a');
    fs.writeFileSync(filePath, Buffer.from('fake-audio'));
    const imported = await importer.importFile(filePath);
    const service = new TranscriptionService(repository, new SuccessfulStt());

    const detail = await service.transcribeRecording(imported.recording.id);

    expect(detail.processingState).toBe('succeeded');
    expect(detail.transcript?.fullText).toContain('第一句中文转写');
    expect(detail.transcript?.segments).toHaveLength(2);
    expect(detail.jobs.find((job) => job.kind === 'transcription')?.state).toBe('succeeded');
    expect(repository.search('第二句').map((item) => item.id)).toContain(imported.recording.id);
  });

  it('marks jobs as failed when STT fails', async () => {
    const repository = new RecordingRepository(dbManager.open());
    const importer = new FileImportService(repository, async () => ({ duration: 6, format: 'M4A' }));
    const filePath = path.join(tmpDir, '失败案例.m4a');
    fs.writeFileSync(filePath, Buffer.from('fake-audio'));
    const imported = await importer.importFile(filePath);
    const service = new TranscriptionService(repository, new FailingStt());

    await expect(service.transcribeRecording(imported.recording.id)).rejects.toThrow('mock STT failed');

    const detail = repository.getRecording(imported.recording.id);
    expect(detail?.processingState).toBe('failed');
    const job = detail?.jobs.find((item) => item.kind === 'transcription');
    expect(job?.state).toBe('failed');
    expect(job?.errorMessage).toBe('mock STT failed');
  });
});

class SuccessfulStt implements SpeechToTextService {
  async transcribe(): Promise<SpeechToTextResult> {
    return {
      language: 'zh',
      duration: 6,
      segments: [
        { start: 0, end: 2.5, text: '第一句中文转写。' },
        { start: 2.5, end: 6, text: '第二句用于搜索。' }
      ]
    };
  }

  async getStatus() {
    return mockStatus();
  }
}

class FailingStt implements SpeechToTextService {
  async transcribe(): Promise<SpeechToTextResult> {
    throw new Error('mock STT failed');
  }

  async getStatus() {
    return mockStatus();
  }
}

function mockStatus() {
  return {
    provider: 'mock' as const,
    ready: true,
    checkedAt: new Date().toISOString(),
    modelName: 'mock',
    device: null,
    computeType: null,
    pythonCommand: null,
    workerPath: null,
    pythonVersion: null,
    fasterWhisperVersion: null,
    errorMessage: null,
    setupHint: null
  };
}
