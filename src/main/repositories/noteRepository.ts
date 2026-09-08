import crypto from 'node:crypto';
import type { SqliteDatabase } from '@main/database/database';
import type { NoteDetail, NoteListItem, RichTextDocument } from '@shared/types/domain';

type NoteRow = {
  id: string;
  title: string;
  content_json: string;
  plain_text: string;
  created_at: string;
  updated_at: string;
};

export type NewNoteInput = {
  title?: string;
  contentJson?: RichTextDocument;
  plainText?: string;
};

export type UpdateNoteInput = {
  title: string;
  contentJson: RichTextDocument;
  plainText: string;
};

const emptyDocument: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }]
};

export class NoteRepository {
  constructor(private readonly db: SqliteDatabase) {}

  createNote(input: NewNoteInput = {}): NoteDetail {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const note = {
      title: normalizeTitle(input.title),
      contentJson: input.contentJson ?? emptyDocument,
      plainText: input.plainText ?? ''
    };

    const write = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO note (id, title, content_json, plain_text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(id, note.title, JSON.stringify(note.contentJson), note.plainText, now, now);
      this.refreshSearchIndex(id);
    });

    write();
    const detail = this.getNote(id);
    if (!detail) {
      throw new Error('Note was inserted but could not be loaded.');
    }
    return detail;
  }

  listNotes(): NoteListItem[] {
    const rows = this.db.prepare('SELECT * FROM note ORDER BY updated_at DESC, rowid DESC').all() as NoteRow[];
    return rows.map(toListItem);
  }

  getCalendarMonth(year: number, month: number): Array<{ date: string; noteCount: number }> {
    const monthPrefix = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
    const rows = this.db.prepare('SELECT * FROM note').all() as NoteRow[];
    const days = new Map<string, number>();

    for (const row of rows) {
      const date = noteDateKey(row);
      if (!date.startsWith(monthPrefix)) {
        continue;
      }
      days.set(date, (days.get(date) ?? 0) + 1);
    }

    return [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, noteCount]) => ({ date, noteCount }));
  }

  listNotesByDate(date: string): NoteListItem[] {
    const rows = this.db.prepare('SELECT * FROM note').all() as NoteRow[];
    return rows
      .filter((row) => noteDateKey(row) === date)
      .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
      .map(toListItem);
  }

  getNote(id: string): NoteDetail | null {
    const row = this.db.prepare('SELECT * FROM note WHERE id = ?').get(id) as NoteRow | undefined;
    return row ? toDetail(row) : null;
  }

  updateNote(id: string, input: UpdateNoteInput): NoteDetail {
    const current = this.getNote(id);
    if (!current) {
      throw new Error('Note was not found.');
    }

    const updatedAt = new Date().toISOString();
    const title = normalizeTitle(input.title);
    const write = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE note
           SET title = ?, content_json = ?, plain_text = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(title, JSON.stringify(input.contentJson), input.plainText, updatedAt, id);
      this.refreshSearchIndex(id);
    });

    write();
    const updated = this.getNote(id);
    if (!updated) {
      throw new Error('Note disappeared after update.');
    }
    return updated;
  }

  deleteNote(id: string): void {
    const note = this.db.prepare('SELECT id FROM note WHERE id = ?').get(id) as { id: string } | undefined;
    if (!note) {
      throw new Error('Note was not found.');
    }

    const write = this.db.transaction(() => {
      this.db.prepare('DELETE FROM note_fts WHERE note_id = ?').run(id);
      this.db.prepare('DELETE FROM note WHERE id = ?').run(id);
    });
    write();
  }

  search(query: string): NoteListItem[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return this.listNotes();
    }

    const ftsRows = this.db
      .prepare(
        `SELECT n.*
         FROM note_fts f
         JOIN note n ON n.id = f.note_id
         WHERE note_fts MATCH ?
         ORDER BY bm25(note_fts), n.updated_at DESC`
      )
      .all(toFtsQuery(trimmed)) as NoteRow[];

    const likeQuery = `%${escapeLike(trimmed)}%`;
    const fallbackRows = this.db
      .prepare(
        `SELECT *
         FROM note
         WHERE title LIKE ? ESCAPE '\\'
            OR plain_text LIKE ? ESCAPE '\\'
         ORDER BY updated_at DESC, rowid DESC`
      )
      .all(likeQuery, likeQuery) as NoteRow[];

    const rowsById = new Map<string, NoteRow>();
    for (const row of [...ftsRows, ...fallbackRows]) {
      rowsById.set(row.id, row);
    }
    return [...rowsById.values()].map(toListItem);
  }

  private refreshSearchIndex(noteId: string): void {
    const note = this.getNote(noteId);
    if (!note) {
      return;
    }

    this.db.prepare('DELETE FROM note_fts WHERE note_id = ?').run(noteId);
    this.db
      .prepare('INSERT INTO note_fts (note_id, title, content) VALUES (?, ?, ?)')
      .run(noteId, note.title, note.plainText);
  }
}

function toListItem(row: NoteRow): NoteListItem {
  return {
    id: row.id,
    title: row.title,
    plainTextPreview: previewText(row.plain_text),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toDetail(row: NoteRow): NoteDetail {
  return {
    ...toListItem(row),
    contentJson: parseContentJson(row.content_json),
    plainText: row.plain_text
  };
}

function normalizeTitle(title: string | undefined): string {
  const trimmed = title?.trim();
  return trimmed ? trimmed.slice(0, 200) : 'Untitled Note';
}

function previewText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function parseContentJson(raw: string): RichTextDocument {
  try {
    const parsed = JSON.parse(raw) as RichTextDocument;
    return parsed && typeof parsed.type === 'string' ? parsed : emptyDocument;
  } catch {
    return emptyDocument;
  }
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

function noteDateKey(row: NoteRow): string {
  const createdAt = new Date(row.created_at);
  return formatLocalDate(Number.isFinite(createdAt.getTime()) ? createdAt : new Date(0));
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
