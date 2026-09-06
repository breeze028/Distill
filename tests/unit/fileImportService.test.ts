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
  it('copies an imported m4a file into the audio library folder and prevents duplicate records', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const libraryDir = path.join(tmpDir, 'library');
    fs.mkdirSync(sourceDir);
    const filePath = path.join(sourceDir, '中文 voice memo.m4a');
    fs.writeFileSync(filePath, Buffer.from('fake-audio'));

    const repository = new RecordingRepository(dbManager.open());
    const service = new FileImportService(repository, async () => ({ duration: 12.5, format: 'M4A' }), () => libraryDir);

    const first = await service.importFile(filePath);
    const second = await service.importFile(filePath);

    expect(first.wasDuplicate).toBe(false);
    expect(first.recording.originalFileName).toBe('中文 voice memo.m4a');
    expect(first.recording.filePath).toBe(path.join(libraryDir, '中文 voice memo.m4a'));
    expect(fs.existsSync(first.recording.filePath)).toBe(true);
    expect(first.recording.duration).toBe(12.5);
    expect(second.wasDuplicate).toBe(true);
    expect(repository.listRecordings()).toHaveLength(1);
  });

  it('uses numbered file names when the audio library folder already has a different same-name file', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const libraryDir = path.join(tmpDir, 'library');
    fs.mkdirSync(sourceDir);
    fs.mkdirSync(libraryDir);
    fs.writeFileSync(path.join(libraryDir, 'meeting.m4a'), Buffer.from('existing-audio'));
    const sourcePath = path.join(sourceDir, 'meeting.m4a');
    fs.writeFileSync(sourcePath, Buffer.from('new-audio'));

    const repository = new RecordingRepository(dbManager.open());
    const service = new FileImportService(repository, async () => ({ duration: 8, format: 'M4A' }), () => libraryDir);

    const imported = await service.importFile(sourcePath);

    expect(imported.wasDuplicate).toBe(false);
    expect(imported.recording.originalFileName).toBe('meeting (2).m4a');
    expect(imported.recording.filePath).toBe(path.join(libraryDir, 'meeting (2).m4a'));
    expect(fs.readFileSync(imported.recording.filePath, 'utf8')).toBe('new-audio');
  });

  it('imports files that are already in the audio library folder without copying', async () => {
    const libraryDir = path.join(tmpDir, 'library');
    fs.mkdirSync(libraryDir);
    const filePath = path.join(libraryDir, 'inside-library.m4a');
    fs.writeFileSync(filePath, Buffer.from('library-audio'));

    const repository = new RecordingRepository(dbManager.open());
    const service = new FileImportService(repository, async () => ({ duration: 4, format: 'M4A' }), () => libraryDir);

    const imported = await service.importFile(filePath);

    expect(imported.wasDuplicate).toBe(false);
    expect(imported.recording.filePath).toBe(filePath);
    expect(repository.listRecordings()).toHaveLength(1);
  });

  it('deduplicates concurrent imports for the copied audio library file', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const libraryDir = path.join(tmpDir, 'library');
    fs.mkdirSync(sourceDir);
    const sourcePath = path.join(sourceDir, 'race.m4a');
    const targetPath = path.join(libraryDir, 'race.m4a');
    fs.writeFileSync(sourcePath, Buffer.from('race-audio'));

    let releaseMetadata!: () => void;
    const metadataGate = new Promise<void>((resolve) => {
      releaseMetadata = resolve;
    });
    const repository = new RecordingRepository(dbManager.open());
    const service = new FileImportService(
      repository,
      async () => {
        await metadataGate;
        return { duration: 6, format: 'M4A' };
      },
      () => libraryDir
    );

    const externalImport = service.importFile(sourcePath);
    await waitForFile(targetPath);
    const watchedImport = service.importFile(targetPath);
    releaseMetadata();
    const [externalResult, watchedResult] = await Promise.all([externalImport, watchedImport]);

    expect(externalResult.recording.id).toBe(watchedResult.recording.id);
    expect(repository.listRecordings()).toHaveLength(1);
  });

  it('requires an audio library folder before importing', async () => {
    const filePath = path.join(tmpDir, 'unconfigured.m4a');
    fs.writeFileSync(filePath, Buffer.from('fake-audio'));

    const repository = new RecordingRepository(dbManager.open());
    const service = new FileImportService(repository, async () => ({ duration: null, format: null }));

    await expect(service.importFile(filePath)).rejects.toThrow('Audio Library Folder is not configured.');
    expect(repository.listRecordings()).toHaveLength(0);
  });

  it('rejects unsupported file formats', async () => {
    const filePath = path.join(tmpDir, 'note.txt');
    fs.writeFileSync(filePath, 'not audio');

    const repository = new RecordingRepository(dbManager.open());
    const service = new FileImportService(repository, async () => ({ duration: null, format: null }), () => tmpDir);

    await expect(service.importFile(filePath)).rejects.toThrow('Unsupported audio format');
  });
});

async function waitForFile(filePath: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1000) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}
