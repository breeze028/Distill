import crypto from 'node:crypto';
import type { SqliteDatabase } from '@main/database/database';
import type { AIArtifact, AIArtifactContent, ProcessingState, RecordingDetail, RecordingListItem, Transcript } from '@shared/types/domain';
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
      latestArtifact: this.getLatestArtifact(id)
    };
  }

  search(query: string): RecordingListItem[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return this.listRecordings();
    }

    const rows = this.db
      .prepare(
        `SELECT r.*
         FROM recording_fts f
         JOIN recording r ON r.id = f.recording_id
         WHERE recording_fts MATCH ?
         ORDER BY bm25(recording_fts), r.imported_at DESC`
      )
      .all(toFtsQuery(trimmed)) as RecordingRow[];

    return rows.map((row) => this.toListItem(row));
  }

  addTranscript(recordingId: string, transcript: Omit<Transcript, 'id' | 'recordingId' | 'createdAt'>): Transcript {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const write = this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO transcript (id, recording_id, language, duration, full_text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, recordingId, transcript.language, transcript.duration, transcript.fullText, createdAt);

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

  private createProcessingJob(recordingId: string, kind: string, state: ProcessingState): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO processing_job (id, recording_id, kind, state, created_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(crypto.randomUUID(), recordingId, kind, state, now, now, now);
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
      latestArtifact: this.getLatestArtifact(id)
    };
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
