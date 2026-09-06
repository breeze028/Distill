import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { RecordingRepository } from '@main/repositories/recordingRepository';
import { FileImportService } from '@main/services/fileImportService';

let tmpDir = '';
let dbManager: DatabaseManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-pipeline-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('recording import to transcript to AI artifact', () => {
  it('persists searchable recording data across the first pipeline stages', async () => {
    const db = dbManager.open();
    const repository = new RecordingRepository(db);
    const importer = new FileImportService(repository, async () => ({ duration: 8, format: 'M4A' }), () => tmpDir);
    const filePath = path.join(tmpDir, '技术想法.m4a');
    fs.writeFileSync(filePath, Buffer.from('fake-audio'));

    const imported = await importer.importFile(filePath);
    repository.addTranscript(imported.recording.id, {
      language: 'zh',
      duration: 8,
      fullText: '今天我在想 SQLite FTS5 搜索和语音笔记的关系。',
      segments: [
        {
          id: 'ignored',
          transcriptId: 'ignored',
          startTime: 0,
          endTime: 8,
          text: '今天我在想 SQLite FTS5 搜索和语音笔记的关系。'
        }
      ]
    });
    repository.ensureBuiltInTemplates([
      {
        id: 'default-summary',
        name: 'Default Summary',
        description: 'Test template',
        promptVersion: 'test',
        prompt: 'Return JSON',
        outputSchema: '{}'
      }
    ]);
    repository.addAIArtifact({
      recordingId: imported.recording.id,
      templateId: 'default-summary',
      provider: 'mock',
      model: 'mock-model',
      promptVersion: 'test',
      rawResponse: null,
      content: {
        title: 'SQLite 语音笔记',
        summary: '关于本地搜索的想法。',
        keyPoints: ['FTS5 can search transcripts'],
        todos: ['验证中文搜索'],
        tags: ['sqlite', 'voice']
      }
    });

    const detail = repository.getRecording(imported.recording.id);
    const searchResults = repository.search('SQLite');

    expect(detail?.transcript?.segments[0]?.startTime).toBe(0);
    expect(detail?.latestArtifact?.content.title).toBe('SQLite 语音笔记');
    expect(searchResults.map((item) => item.id)).toContain(imported.recording.id);
  });
});
