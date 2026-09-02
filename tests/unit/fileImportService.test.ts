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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-test-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('FileImportService', () => {
  it('imports an m4a file and prevents duplicate records', async () => {
    const filePath = path.join(tmpDir, '中文 voice memo.m4a');
    fs.writeFileSync(filePath, Buffer.from('fake-audio'));

    const repository = new RecordingRepository(dbManager.open());
    const service = new FileImportService(repository, async () => ({ duration: 12.5, format: 'M4A' }));

    const first = await service.importFile(filePath);
    const second = await service.importFile(filePath);

    expect(first.wasDuplicate).toBe(false);
    expect(first.recording.originalFileName).toBe('中文 voice memo.m4a');
    expect(first.recording.duration).toBe(12.5);
    expect(second.wasDuplicate).toBe(true);
    expect(repository.listRecordings()).toHaveLength(1);
  });

  it('rejects unsupported file formats', async () => {
    const filePath = path.join(tmpDir, 'note.txt');
    fs.writeFileSync(filePath, 'not audio');

    const repository = new RecordingRepository(dbManager.open());
    const service = new FileImportService(repository, async () => ({ duration: null, format: null }));

    await expect(service.importFile(filePath)).rejects.toThrow('Unsupported audio format');
  });
});
