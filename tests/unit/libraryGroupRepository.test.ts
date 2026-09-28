import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { LibraryGroupRepository } from '@main/repositories/libraryGroupRepository';
import type { NewRecording } from '@main/repositories/recordingRepository';
import { RecordingRepository } from '@main/repositories/recordingRepository';
import { NoteRepository } from '@main/repositories/noteRepository';

let tmpDir = '';
let dbManager: DatabaseManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-library-group-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('LibraryGroupRepository', () => {
  it('creates groups and stores mixed recording/note refs', () => {
    const db = dbManager.open();
    const groups = new LibraryGroupRepository(db);
    const recordings = new RecordingRepository(db);
    const notes = new NoteRepository(db);
    const recording = recordings.createRecording(newRecording('grouped.m4a'));
    const note = notes.createNote({ title: '组内笔记', plainText: '笔记内容' });

    const group = groups.createGroup('九月复盘');
    groups.addItem(group.id, { kind: 'recording', id: recording.id });
    groups.addItem(group.id, { kind: 'note', id: note.id });
    groups.addItem(group.id, { kind: 'note', id: note.id });

    expect(groups.listGroups()[0]).toMatchObject({ id: group.id, title: '九月复盘', itemCount: 2 });
    expect(groups.listItemRefs(group.id)).toEqual([
      { kind: 'note', id: note.id },
      { kind: 'recording', id: recording.id }
    ]);
  });

  it('removes one item or all refs for a deleted source item', () => {
    const db = dbManager.open();
    const groups = new LibraryGroupRepository(db);
    const recordings = new RecordingRepository(db);
    const recording = recordings.createRecording(newRecording('delete-from-groups.m4a'));
    const first = groups.createGroup('第一组');
    const second = groups.createGroup('第二组');

    groups.addItem(first.id, { kind: 'recording', id: recording.id });
    groups.addItem(second.id, { kind: 'recording', id: recording.id });
    groups.removeItem(first.id, { kind: 'recording', id: recording.id });

    expect(groups.listItemRefs(first.id)).toEqual([]);
    expect(groups.listItemRefs(second.id)).toEqual([{ kind: 'recording', id: recording.id }]);

    groups.deleteItemFromAllGroups({ kind: 'recording', id: recording.id });

    expect(groups.listItemRefs(second.id)).toEqual([]);
    expect(groups.listGroups().map((group) => group.itemCount)).toEqual([0, 0]);
  });
});

function newRecording(fileName: string, overrides: Partial<NewRecording> = {}): NewRecording {
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
    createdAt: null,
    ...overrides
  };
}
