import crypto from 'node:crypto';
import type { SqliteDatabase } from '@main/database/database';
import type { AIArtifact, AIArtifactContent, ProcessingJob, ProcessingJobKind, ProcessingState, RecordingDetail, RecordingListItem, SpeechToTextProvider, Transcript } from '@shared/types/domain';
import { aiArtifactContentSchema } from '@shared/schemas/ai';

type RecordingRow = {
  id: string;
  title: string;
  original_file_name: string;
  file_path: string;
  file_size: number;
  format: string;
  duration: number | null;
  imported_at: string;
  created_at: string | null;
  processing_state: ProcessingState;
};

type TranscriptRow = {
  id: string;
  recording_id: string;
  language: string | null;
  duration: number | null;
  provider: string | null;
  model: string | null;
  source_job_id: string | null;
  full_text: string;
  created_at: string;
};

type SegmentRow = {
  id: string;
  transcript_id: string;
  start_time: number;
  end_time: number;
  text: string;
};

type ArtifactRow = {
  id: string;
  recording_id: string;
  template_id: string;
  provider: string;
  model: string;
  prompt_version: string;
  content_json: string;
  raw_response: string | null;
  created_at: string;
};

type ProcessingJobRow = {
  id: string;
  recording_id: string;
  kind: ProcessingJobKind;
  state: ProcessingState;
  error_message: string | null;
  error_detail: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type NewRecording = {
  title: string;
  originalFileName: string;
  filePath: string;
  normalizedFilePath: string;
  fileSize: number;
  fileMtimeMs: number;
  format: string;
  duration: number | null;
  createdAt: string | null;
};

type NewTranscript = Omit<Transcript, 'id' | 'recordingId' | 'createdAt' | 'provider' | 'model' | 'sourceJobId'> &
  Partial<Pick<Transcript, 'provider' | 'model' | 'sourceJobId'>>;

export class RecordingRepository {
  constructor(private readonly db: SqliteDatabase) {}

  createRecording(input: NewRecording): RecordingDetail {
    const id = crypto.randomUUID();
    const importedAt = new Date().toISOString();

    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO recording (
            id, title, original_file_name, file_path, normalized_file_path, file_size,
            file_mtime_ms, format, duration, imported_at, created_at, processing_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.title,
          input.originalFileName,
          input.filePath,
          input.normalizedFilePath,
          input.fileSize,
          input.fileMtimeMs,
          input.format,
          input.duration,
          importedAt,
          input.createdAt,
          'pending'
        );

      this.createProcessingJob(id, 'import', 'succeeded');
      this.refreshSearchIndex(id);
    });

    insert();
    const detail = this.getRecording(id);
    if (!detail) {
      throw new Error('Recording was inserted but could not be loaded.');
    }
    return detail;
  }

  findDuplicate(normalizedPath: string, fileSize: number, fileMtimeMs: number): RecordingDetail | null {
    const row = this.db
      .prepare(
        `SELECT id FROM recording
         WHERE normalized_file_path = ? AND file_size = ? AND file_mtime_ms = ?`
      )
      .get(normalizedPath, fileSize, fileMtimeMs) as { id: string } | undefined;

    return row ? this.getRecording(row.id) : null;
  }

  listRecordings(): RecordingListItem[] {
    const rows = this.db
      .prepare('SELECT * FROM recording ORDER BY imported_at DESC')
      .all() as RecordingRow[];
    return rows.map((row) => this.toListItem(row));
  }

  getRecording(id: string): RecordingDetail | null {
    const row = this.db.prepare('SELECT * FROM recording WHERE id = ?').get(id) as RecordingRow | undefined;
    if (!row) {
      return null;
    }

    return {
      ...this.toListItem(row),
      transcript: this.getLatestTranscript(id),
      latestArtifact: this.getLatestArtifact(id),
      jobs: this.listProcessingJobs(id)
    };
  }

  search(query: string): RecordingListItem[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return this.listRecordings();
    }

    const ftsRows = this.db
      .prepare(
        `SELECT r.*
         FROM recording_fts f
         JOIN recording r ON r.id = f.recording_id
         WHERE recording_fts MATCH ?
         ORDER BY bm25(recording_fts), r.imported_at DESC`
      )
      .all(toFtsQuery(trimmed)) as RecordingRow[];

    const likeQuery = `%${escapeLike(trimmed)}%`;
    const fallbackRows = this.db
      .prepare(
        `SELECT DISTINCT r.*
         FROM recording r
         LEFT JOIN transcript tr ON tr.recording_id = r.id
         LEFT JOIN ai_artifact a ON a.recording_id = r.id
         LEFT JOIN recording_tag rt ON rt.recording_id = r.id
         LEFT JOIN tag t ON t.id = rt.tag_id
         WHERE r.title LIKE ? ESCAPE '\\'
          OR r.original_file_name LIKE ? ESCAPE '\\'
          OR tr.full_text LIKE ? ESCAPE '\\'
          OR a.content_json LIKE ? ESCAPE '\\'
          OR t.name LIKE ? ESCAPE '\\'
         ORDER BY r.imported_at DESC`
      )
      .all(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery) as RecordingRow[];

    const rowsById = new Map<string, RecordingRow>();
    for (const row of [...ftsRows, ...fallbackRows]) {
      rowsById.set(row.id, row);
    }

    return [...rowsById.values()].map((row) => this.toListItem(row));
  }

  addTranscript(recordingId: string, transcript: NewTranscript): Transcript {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const write = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO transcript (
            id, recording_id, language, duration, provider, model, source_job_id, full_text, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          recordingId,
          transcript.language,
          transcript.duration,
          transcript.provider ?? null,
          transcript.model ?? null,
          transcript.sourceJobId ?? null,
          transcript.fullText,
          createdAt
        );

      const insertSegment = this.db.prepare(
        'INSERT INTO transcript_segment (id, transcript_id, start_time, end_time, text) VALUES (?, ?, ?, ?, ?)'
      );
      for (const segment of transcript.segments) {
        insertSegment.run(crypto.randomUUID(), id, segment.startTime, segment.endTime, segment.text);
      }

      this.db.prepare("UPDATE recording SET processing_state = 'succeeded' WHERE id = ?").run(recordingId);
      this.refreshSearchIndex(recordingId);
    });

    write();
    const saved = this.getLatestTranscript(recordingId);
    if (!saved) {
      throw new Error('Transcript was inserted but could not be loaded.');
    }
    return saved;
  }

  addAIArtifact(input: Omit<AIArtifact, 'id' | 'createdAt'>): AIArtifact {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const content = aiArtifactContentSchema.parse(input.content);

    this.db
      .prepare(
        `INSERT INTO ai_artifact (
          id, recording_id, template_id, provider, model, prompt_version, content_json, raw_response, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.recordingId, input.templateId, input.provider, input.model, input.promptVersion, JSON.stringify(content), input.rawResponse, createdAt);

    this.refreshSearchIndex(input.recordingId);
    return { ...input, id, createdAt, content };
  }

  ensureBuiltInTemplates(templates: Array<{ id: string; name: string; description: string; promptVersion: string; prompt: string; outputSchema: string }>): void {
    const now = new Date().toISOString();
    const upsert = this.db.prepare(
      `INSERT INTO ai_template (id, name, description, prompt_version, prompt, output_schema, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        prompt_version = excluded.prompt_version,
        prompt = excluded.prompt,
        output_schema = excluded.output_schema,
        updated_at = excluded.updated_at`
    );

    const write = this.db.transaction(() => {
      for (const template of templates) {
        upsert.run(template.id, template.name, template.description, template.promptVersion, template.prompt, template.outputSchema, now, now);
      }
    });
    write();
  }

  recoverInterruptedJobs(errorMessage = '应用关闭或任务中断，处理任务未完成。'): number {
    const rows = this.db
      .prepare("SELECT DISTINCT recording_id FROM processing_job WHERE state = 'running'")
      .all() as Array<{ recording_id: string }>;
    if (rows.length === 0) {
      return 0;
    }

    const now = new Date().toISOString();
    const recover = this.db.transaction(() => {
      this.db
        .prepare("UPDATE processing_job SET state = 'failed', error_message = ?, finished_at = ? WHERE state = 'running'")
        .run(errorMessage, now);

      for (const row of rows) {
        this.db
          .prepare(
            `UPDATE recording
             SET processing_state = CASE
               WHEN EXISTS (SELECT 1 FROM transcript WHERE recording_id = ?) THEN 'succeeded'
               ELSE 'failed'
             END
             WHERE id = ?`
          )
          .run(row.recording_id, row.recording_id);
        this.refreshSearchIndex(row.recording_id);
      }
    });

    recover();
    return rows.length;
  }

  createProcessingJob(recordingId: string, kind: ProcessingJobKind, state: ProcessingState = 'pending'): ProcessingJob {
    const now = new Date().toISOString();
    const startedAt = state === 'pending' ? null : now;
    const finishedAt = state === 'succeeded' || state === 'failed' ? now : null;
    const id = crypto.randomUUID();

    this.db
      .prepare(
        `INSERT INTO processing_job (id, recording_id, kind, state, created_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, recordingId, kind, state, now, startedAt, finishedAt);

    return this.getProcessingJob(id);
  }

  markProcessingJobRunning(id: string): ProcessingJob {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE processing_job SET state = 'running', started_at = COALESCE(started_at, ?), error_message = NULL, error_detail = NULL WHERE id = ?")
      .run(now, id);
    return this.getProcessingJob(id);
  }

  markProcessingJobSucceeded(id: string): ProcessingJob {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE processing_job SET state = 'succeeded', finished_at = ? WHERE id = ?").run(now, id);
    return this.getProcessingJob(id);
  }

  markProcessingJobFailed(id: string, errorMessage: string, errorDetail: string | null): ProcessingJob {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE processing_job SET state = 'failed', error_message = ?, error_detail = ?, finished_at = ? WHERE id = ?")
      .run(errorMessage, errorDetail, now, id);
    return this.getProcessingJob(id);
  }

  updateRecordingProcessingState(recordingId: string, state: ProcessingState): void {
    this.db.prepare('UPDATE recording SET processing_state = ? WHERE id = ?').run(state, recordingId);
    this.refreshSearchIndex(recordingId);
  }

  private toListItem(row: RecordingRow): RecordingListItem {
    return {
      id: row.id,
      title: row.title,
      originalFileName: row.original_file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      format: row.format,
      duration: row.duration,
      importedAt: row.imported_at,
      createdAt: row.created_at,
      processingState: row.processing_state,
      tags: this.getTags(row.id)
    };
  }

  private getTags(recordingId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT t.name
         FROM tag t
         JOIN recording_tag rt ON rt.tag_id = t.id
         WHERE rt.recording_id = ?
         ORDER BY t.name`
      )
      .all(recordingId) as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  private getLatestTranscript(recordingId: string): Transcript | null {
    const row = this.db
      .prepare('SELECT * FROM transcript WHERE recording_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(recordingId) as TranscriptRow | undefined;

    if (!row) {
      return null;
    }

    const segments = this.db
      .prepare('SELECT * FROM transcript_segment WHERE transcript_id = ? ORDER BY start_time ASC')
      .all(row.id) as SegmentRow[];

    return {
      id: row.id,
      recordingId: row.recording_id,
      language: row.language,
      duration: row.duration,
      provider: toSpeechToTextProvider(row.provider),
      model: row.model,
      sourceJobId: row.source_job_id,
      fullText: row.full_text,
      createdAt: row.created_at,
      segments: segments.map((segment) => ({
        id: segment.id,
        transcriptId: segment.transcript_id,
        startTime: segment.start_time,
        endTime: segment.end_time,
        text: segment.text
      }))
    };
  }

  private getLatestArtifact(recordingId: string): AIArtifact | null {
    const row = this.db
      .prepare('SELECT * FROM ai_artifact WHERE recording_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(recordingId) as ArtifactRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      recordingId: row.recording_id,
      templateId: row.template_id,
      provider: row.provider,
      model: row.model,
      promptVersion: row.prompt_version,
      content: aiArtifactContentSchema.parse(JSON.parse(row.content_json) as unknown),
      rawResponse: row.raw_response,
      createdAt: row.created_at
    };
  }

  private refreshSearchIndex(recordingId: string): void {
    const detail = this.getRecordingWithoutFtsRefresh(recordingId);
    if (!detail) {
      return;
    }

    this.db.prepare('DELETE FROM recording_fts WHERE recording_id = ?').run(recordingId);
    this.db
      .prepare('INSERT INTO recording_fts (recording_id, title, transcript, ai_content, tags) VALUES (?, ?, ?, ?, ?)')
      .run(
        recordingId,
        detail.title,
        detail.transcript?.fullText ?? '',
        serializeArtifact(detail.latestArtifact?.content),
        detail.tags.join(' ')
      );
  }

  private getRecordingWithoutFtsRefresh(id: string): RecordingDetail | null {
    const row = this.db.prepare('SELECT * FROM recording WHERE id = ?').get(id) as RecordingRow | undefined;
    if (!row) {
      return null;
    }
    return {
      ...this.toListItem(row),
      transcript: this.getLatestTranscript(id),
      latestArtifact: this.getLatestArtifact(id),
      jobs: this.listProcessingJobs(id)
    };
  }

  private listProcessingJobs(recordingId: string): ProcessingJob[] {
    const rows = this.db
      .prepare('SELECT * FROM processing_job WHERE recording_id = ? ORDER BY created_at DESC')
      .all(recordingId) as ProcessingJobRow[];

    return rows.map(toProcessingJob);
  }

  private getProcessingJob(id: string): ProcessingJob {
    const row = this.db.prepare('SELECT * FROM processing_job WHERE id = ?').get(id) as ProcessingJobRow | undefined;
    if (!row) {
      throw new Error(`Processing job not found: ${id}`);
    }
    return toProcessingJob(row);
  }
}

function serializeArtifact(content: AIArtifactContent | undefined): string {
  if (!content) {
    return '';
  }
  return [content.title, content.summary, ...content.keyPoints, ...content.todos, ...content.tags].join('\n');
}

function toFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(' OR ');
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (part) => `\\${part}`);
}

function toProcessingJob(row: ProcessingJobRow): ProcessingJob {
  return {
    id: row.id,
    recordingId: row.recording_id,
    kind: row.kind,
    state: row.state,
    errorMessage: row.error_message,
    errorDetail: row.error_detail,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

function toSpeechToTextProvider(value: string | null): SpeechToTextProvider | null {
  return value === 'mock' || value === 'python' ? value : null;
}
