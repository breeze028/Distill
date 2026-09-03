import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { RecordingRepository } from '@main/repositories/recordingRepository';

let tmpDir = '';
let dbManager: DatabaseManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-repository-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('RecordingRepository', () => {
  it('recovers interrupted running jobs on startup', () => {
    const repository = new RecordingRepository(dbManager.open());
    const recording = repository.createRecording(newRecording('interrupted.m4a'));
    repository.createProcessingJob(recording.id, 'transcription', 'running');
    repository.updateRecordingProcessingState(recording.id, 'running');

    const recovered = repository.recoverInterruptedJobs('interrupted');
    const detail = repository.getRecording(recording.id);

    expect(recovered).toBe(1);
    expect(detail?.processingState).toBe('failed');
    expect(detail?.jobs.find((job) => job.kind === 'transcription')?.state).toBe('failed');
    expect(detail?.jobs.find((job) => job.kind === 'transcription')?.errorMessage).toBe('interrupted');
  });

  it('keeps recordings with transcripts succeeded when recovering interrupted jobs', () => {
    const repository = new RecordingRepository(dbManager.open());
    const recording = repository.createRecording(newRecording('with-transcript.m4a'));
    repository.addTranscript(recording.id, {
      language: 'zh',
      duration: 3,
      fullText: '已经有转写文本。',
      segments: [
        {
          id: 'ignored',
          transcriptId: 'ignored',
          startTime: 0,
          endTime: 3,
          text: '已经有转写文本。'
        }
      ]
    });
    repository.createProcessingJob(recording.id, 'transcription', 'running');
    repository.updateRecordingProcessingState(recording.id, 'running');

    const recovered = repository.recoverInterruptedJobs('interrupted');
    const detail = repository.getRecording(recording.id);

    expect(recovered).toBe(1);
    expect(detail?.processingState).toBe('succeeded');
    expect(detail?.transcript?.fullText).toBe('已经有转写文本。');
  });
});

function newRecording(fileName: string) {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, Buffer.from('fake-audio'));
  return {
    title: path.basename(fileName, path.extname(fileName)),
    originalFileName: fileName,
    filePath,
    normalizedFilePath: filePath.toLowerCase(),
    fileSize: 10,
    fileMtimeMs: 1,
    format: path.extname(fileName).slice(1),
    duration: 3,
    createdAt: null
  };
}
