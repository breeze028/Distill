import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { RecordingRepository } from '@main/repositories/recordingRepository';
import type { NewRecording } from '@main/repositories/recordingRepository';

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

  it('edits a transcript segment by creating a latest transcript revision and refreshing search', () => {
    const db = dbManager.open();
    const repository = new RecordingRepository(db);
    const recording = repository.createRecording(newRecording('editable-transcript.m4a'));
    const original = repository.addTranscript(recording.id, {
      language: 'zh',
      duration: 5,
      provider: 'python',
      model: 'medium',
      sourceJobId: null,
      fullText: '第一句。\n旧关键词。',
      segments: [
        {
          id: 'ignored',
          transcriptId: 'ignored',
          startTime: 0,
          endTime: 2,
          text: '第一句。'
        },
        {
          id: 'ignored',
          transcriptId: 'ignored',
          startTime: 2,
          endTime: 5,
          text: '旧关键词。'
        }
      ]
    });

    const updated = repository.editTranscriptSegment(recording.id, original.id, original.segments[1]?.id ?? '', '改后关键词。');
    const transcriptRows = db
      .prepare('SELECT id, full_text FROM transcript WHERE recording_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(recording.id) as Array<{ id: string; full_text: string }>;

    expect(updated.transcript?.id).not.toBe(original.id);
    expect(updated.transcript?.provider).toBe('python');
    expect(updated.transcript?.model).toBe('medium');
    expect(updated.transcript?.fullText).toBe('第一句。\n改后关键词。');
    expect(updated.transcript?.segments[1]?.text).toBe('改后关键词。');
    expect(transcriptRows).toHaveLength(2);
    expect(transcriptRows[0]?.id).toBe(original.id);
    expect(transcriptRows[0]?.full_text).toContain('旧关键词');
    expect(repository.search('改后关键词').map((item) => item.id)).toContain(recording.id);
    expect(repository.search('旧关键词').map((item) => item.id)).not.toContain(recording.id);
  });

  it('matches natural Chinese questions against transcript keywords', () => {
    const repository = new RecordingRepository(dbManager.open());
    const recording = repository.createRecording(newRecording('reflection-prompts.m4a'));
    repository.addTranscript(recording.id, {
      language: 'zh',
      duration: 6,
      fullText: '我想每周做一次复盘，用几个话头把记忆勾出来。',
      segments: [
        {
          id: 'ignored',
          transcriptId: 'ignored',
          startTime: 0,
          endTime: 6,
          text: '我想每周做一次复盘，用几个话头把记忆勾出来。'
        }
      ]
    });

    const results = repository.search('我以前有没有提过每周复盘的话头？');

    expect(results.map((item) => item.id)).toContain(recording.id);
    expect(repository.searchWithinRecording(recording.id, '之前说过复盘话头吗')).toBe(true);
  });

  it('uses recording creation dates for calendar month grouping', () => {
    const repository = new RecordingRepository(dbManager.open());
    const morning = repository.createRecording(newRecording('morning.m4a', {
      createdAt: new Date(2026, 8, 2, 9, 30).toISOString(),
      duration: 10
    }));
    const evening = repository.createRecording(newRecording('evening.m4a', {
      createdAt: new Date(2026, 8, 2, 21, 0).toISOString(),
      duration: 20
    }));
    repository.createRecording(newRecording('next-day.m4a', {
      createdAt: new Date(2026, 8, 3, 8, 0).toISOString(),
      duration: null
    }));

    const days = repository.getCalendarMonth(2026, 9);
    const recordings = repository.listRecordingsByDate('2026-09-02');

    expect(days).toEqual([
      { date: '2026-09-02', recordingCount: 2, totalDuration: 30 },
      { date: '2026-09-03', recordingCount: 1, totalDuration: null }
    ]);
    expect(recordings.map((recording) => recording.id)).toEqual([evening.id, morning.id]);
  });

  it('falls back to import date when a recording has no creation date', () => {
    const repository = new RecordingRepository(dbManager.open());
    const recording = repository.createRecording(newRecording('fallback-date.m4a', {
      createdAt: null,
      duration: 5
    }));
    const today = formatLocalDate(new Date(recording.importedAt));
    const [year, month] = today.split('-').map(Number);

    const days = repository.getCalendarMonth(year ?? 0, month ?? 0);
    const recordings = repository.listRecordingsByDate(today);

    expect(days).toContainEqual({ date: today, recordingCount: 1, totalDuration: 5 });
    expect(recordings.map((item) => item.id)).toEqual([recording.id]);
  });

  it('uses the latest AI artifact title when listing recordings', () => {
    const repository = new RecordingRepository(dbManager.open());
    repository.ensureBuiltInTemplates([
      testTemplate('default-summary'),
      testTemplate('technical-thinking')
    ]);
    const recording = repository.createRecording(newRecording('original-file-title.m4a', {
      createdAt: new Date(2026, 8, 4, 10, 0).toISOString()
    }));

    const firstArtifact = repository.addAIArtifact(aiArtifact(recording.id, 'default-summary', '第一版 AI 标题'));
    const secondArtifact = repository.addAIArtifact(aiArtifact(recording.id, 'technical-thinking', '第二版 AI 标题'));

    expect(repository.getRecording(recording.id)?.title).toBe('第二版 AI 标题');
    expect(repository.listRecordings()[0]?.title).toBe('第二版 AI 标题');
    expect(repository.listRecordingsByDate('2026-09-04')[0]?.title).toBe('第二版 AI 标题');

    repository.deleteAIArtifact(recording.id, secondArtifact.id);
    expect(repository.listRecordings()[0]?.title).toBe('第一版 AI 标题');

    repository.deleteAIArtifact(recording.id, firstArtifact.id);
    expect(repository.listRecordings()[0]?.title).toBe('original-file-title');
  });

  it('deletes a recording and its related searchable data', () => {
    const db = dbManager.open();
    const repository = new RecordingRepository(db);
    repository.ensureBuiltInTemplates([testTemplate('default-summary')]);
    const recording = repository.createRecording(newRecording('delete-me.m4a'));
    repository.addTranscript(recording.id, {
      language: 'zh',
      duration: 3,
      fullText: '删除测试关键词。',
      segments: [
        {
          id: 'ignored',
          transcriptId: 'ignored',
          startTime: 0,
          endTime: 3,
          text: '删除测试关键词。'
        }
      ]
    });
    repository.addAIArtifact(aiArtifact(recording.id, 'default-summary', '删除测试 AI 标题'));
    repository.createProcessingJob(recording.id, 'ai', 'succeeded');

    expect(repository.search('删除测试关键词').map((item) => item.id)).toContain(recording.id);

    repository.deleteRecording(recording.id);

    expect(repository.getRecording(recording.id)).toBeNull();
    expect(repository.search('删除测试关键词').map((item) => item.id)).not.toContain(recording.id);
    expect(db.prepare('SELECT COUNT(*) AS count FROM recording_fts WHERE recording_id = ?').get(recording.id)).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM transcript WHERE recording_id = ?').get(recording.id)).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM ai_artifact WHERE recording_id = ?').get(recording.id)).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM processing_job WHERE recording_id = ?').get(recording.id)).toEqual({ count: 0 });
  });
});

function newRecording(fileName: string, overrides: Partial<NewRecording> = {}): NewRecording {
  return {
    ...baseRecording(fileName),
    ...overrides
  };
}

function baseRecording(fileName: string): NewRecording {
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

function aiArtifact(recordingId: string, templateId: string, title: string) {
  return {
    recordingId,
    templateId,
    provider: 'mock',
    model: 'mock',
    promptVersion: 'test',
    rawResponse: null,
    content: {
      title,
      summary: '测试摘要。',
      keyPoints: [],
      todos: [],
      tags: []
    }
  };
}

function testTemplate(id: string) {
  return {
    id,
    name: id,
    description: id,
    promptVersion: 'test',
    prompt: 'test',
    outputSchema: '{}'
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
