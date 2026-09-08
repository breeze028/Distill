import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { NoteRepository } from '@main/repositories/noteRepository';
import type { RichTextDocument } from '@shared/types/domain';

let tmpDir = '';
let dbManager: DatabaseManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-note-repository-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('NoteRepository', () => {
  it('creates and lists text notes by updated time', () => {
    const repository = new NoteRepository(dbManager.open());

    const first = repository.createNote({
      title: '第一条笔记',
      plainText: '这是第一条内容。',
      contentJson: paragraphDocument('这是第一条内容。')
    });
    const second = repository.createNote({
      title: '第二条笔记',
      plainText: '这是第二条内容。',
      contentJson: paragraphDocument('这是第二条内容。')
    });

    const notes = repository.listNotes();

    expect(first.title).toBe('第一条笔记');
    expect(second.plainTextPreview).toBe('这是第二条内容。');
    expect(notes.map((note) => note.id)).toEqual([second.id, first.id]);
  });

  it('updates note content and refreshes search', () => {
    const repository = new NoteRepository(dbManager.open());
    const note = repository.createNote({
      title: '旧标题',
      plainText: '旧关键词',
      contentJson: paragraphDocument('旧关键词')
    });

    const updated = repository.updateNote(note.id, {
      title: '新标题',
      plainText: '人工笔记关键词',
      contentJson: paragraphDocument('人工笔记关键词')
    });

    expect(updated.title).toBe('新标题');
    expect(updated.plainText).toBe('人工笔记关键词');
    expect(repository.search('人工笔记关键词').map((item) => item.id)).toContain(note.id);
    expect(repository.search('旧关键词').map((item) => item.id)).not.toContain(note.id);
  });

  it('deletes notes and their search rows', () => {
    const db = dbManager.open();
    const repository = new NoteRepository(db);
    const note = repository.createNote({
      title: '删除笔记',
      plainText: '删除搜索词',
      contentJson: paragraphDocument('删除搜索词')
    });

    expect(repository.search('删除搜索词').map((item) => item.id)).toContain(note.id);

    repository.deleteNote(note.id);

    expect(repository.getNote(note.id)).toBeNull();
    expect(repository.search('删除搜索词').map((item) => item.id)).not.toContain(note.id);
    expect(db.prepare('SELECT COUNT(*) AS count FROM note_fts WHERE note_id = ?').get(note.id)).toEqual({ count: 0 });
  });

  it('groups notes by creation date for calendar views', () => {
    const repository = new NoteRepository(dbManager.open());
    const note = repository.createNote({
      title: '日历笔记',
      plainText: '日历里也应该看到笔记。',
      contentJson: paragraphDocument('日历里也应该看到笔记。')
    });
    const date = formatLocalDate(new Date(note.createdAt));
    const [year, month] = date.split('-').map(Number);

    const days = repository.getCalendarMonth(year ?? 0, month ?? 0);
    const notes = repository.listNotesByDate(date);

    expect(days).toContainEqual({ date, noteCount: 1 });
    expect(notes.map((item) => item.id)).toEqual([note.id]);
  });

  it('falls back to an empty document when stored note JSON is invalid', () => {
    const db = dbManager.open();
    const repository = new NoteRepository(db);
    const note = repository.createNote({
      title: '坏数据防御',
      plainText: '正文',
      contentJson: paragraphDocument('正文')
    });

    db.prepare('UPDATE note SET content_json = ? WHERE id = ?').run('{bad json', note.id);

    expect(repository.getNote(note.id)?.contentJson).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }]
    });
  });
});

function paragraphDocument(text: string): RichTextDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }]
      }
    ]
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
