import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { RecordingRepository } from '@main/repositories/recordingRepository';
import { SettingsRepository } from '@main/settings/settingsRepository';
import { FileImportService } from '@main/services/fileImportService';
import { TranscriptionService } from '@main/services/transcriptionService';
import { WatchFolderService } from '@main/services/watchFolderService';
import { MockSpeechToTextService } from '@main/stt/mockSpeechToTextService';

let tmpDir = '';
let dbManager: DatabaseManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-watch-folder-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WatchFolderService', () => {
  it('imports new audio files from the configured watch folder and starts transcription', async () => {
    const db = dbManager.open();
    const recordings = new RecordingRepository(db);
    const settings = new SettingsRepository(db);
    const importer = new FileImportService(recordings, async () => ({ duration: 5, format: 'M4A' }));
    const transcriber = new TranscriptionService(recordings, new MockSpeechToTextService());
    const onImported = vi.fn();
    const watchFolder = new WatchFolderService(settings, importer, transcriber, { debounceMs: 20, settleMs: 20, onImported });
    const inboxPath = path.join(tmpDir, 'inbox');
    fs.mkdirSync(inboxPath);
    settings.saveSettings({ watchFolder: inboxPath, autoTranscribeOnImport: true });

    const status = await watchFolder.refresh();
    expect(status.running).toBe(true);

    fs.writeFileSync(path.join(inboxPath, '自动导入.m4a'), Buffer.from('fake-audio'));
    const detail = await waitForImportedTranscript(recordings);

    expect(detail.title).toBe('自动导入');
    expect(detail.jobs.some((job) => job.kind === 'transcription')).toBe(true);
    expect(detail.transcript?.segments.length).toBeGreaterThan(0);
    expect(onImported).toHaveBeenCalledWith(detail.id);
    expect(watchFolder.getStatus().lastEventAt).toBeTruthy();
    watchFolder.stop();
  });
});

async function waitForImportedTranscript(recordings: RecordingRepository) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const item = recordings.listRecordings()[0];
    const detail = item ? recordings.getRecording(item.id) : null;
    if (detail?.transcript) {
      return detail;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for watched file import.');
}
