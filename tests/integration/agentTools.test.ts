import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/database/database';
import { RecordingRepository, type NewRecording } from '@main/repositories/recordingRepository';
import { NoteRepository } from '@main/repositories/noteRepository';
import { ToolRegistry } from '@main/agent/tools/toolRegistry';
import { createLibraryTools } from '@main/agent/tools/libraryTools';
import type { RichTextDocument } from '@shared/types/domain';

let tmpDir = '';
let dbManager: DatabaseManager;
let recordings: RecordingRepository;
let notes: NoteRepository;
let registry: ToolRegistry;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-agent-tools-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
  const db = dbManager.open();
  recordings = new RecordingRepository(db);
  notes = new NoteRepository(db);
  registry = new ToolRegistry(createLibraryTools(recordings, notes));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Agent library tools', () => {
  it('searches recordings through real repository retrieval', async () => {
    const recording = recordings.createRecording(newRecording('weekend.m4a', {
      createdAt: new Date(2026, 8, 2, 10, 0).toISOString()
    }));
    recordings.addTranscript(recording.id, {
      language: 'zh',
      duration: 4,
      fullText: '这个周末很无聊，不知道做什么。',
      segments: [
        {
          id: 'ignored',
          transcriptId: 'ignored',
          startTime: 0,
          endTime: 4,
          text: '这个周末很无聊，不知道做什么。'
        }
      ]
    });

    const result = await registry.execute('search_library', { query: '周末', kind: 'all', limit: 5 }, { scope: { kind: 'all' } });

    expect(result.ok).toBe(true);
    expect(result.sources[0]).toMatchObject({
      kind: 'recording',
      recordingId: recording.id,
      startTime: 0,
      snippet: '这个周末很无聊，不知道做什么。'
    });
    expect(result.sources[0]).toHaveProperty('segmentId');
    expect(result.content).toContain('weekend');
  });

  it('searches notes and reads plain text for note questions', async () => {
    const note = notes.createNote({
      title: '摄影计划',
      plainText: '我之前写过想学习摄影，先从周末扫街开始。',
      contentJson: paragraphDocument('我之前写过想学习摄影，先从周末扫街开始。')
    });

    const search = await registry.execute('search_library', { query: '摄影', kind: 'note', limit: 5 }, { scope: { kind: 'all' } });
    const detail = await registry.execute('get_note', { noteId: note.id }, { scope: { kind: 'all' } });

    expect(search.ok).toBe(true);
    expect(search.sources[0]).toMatchObject({ kind: 'note', noteId: note.id });
    expect(detail.content).toContain('想学习摄影');
  });

  it('enforces Current Item scope', async () => {
    const first = notes.createNote({
      title: '当前笔记',
      plainText: '只读当前笔记。',
      contentJson: paragraphDocument('只读当前笔记。')
    });
    const second = notes.createNote({
      title: '其他笔记',
      plainText: '摄影',
      contentJson: paragraphDocument('摄影')
    });

    const denied = await registry.execute('get_note', { noteId: second.id }, {
      scope: { kind: 'current', item: { kind: 'note', id: first.id } }
    });
    const search = await registry.execute('search_library', { query: '摄影', kind: 'all', limit: 5 }, {
      scope: { kind: 'current', item: { kind: 'note', id: first.id } }
    });

    expect(denied.ok).toBe(false);
    expect(search.content).toContain('"items":[]');
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
