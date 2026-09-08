import { describe, expect, it } from 'vitest';
import { calendarMonthRequestSchema, noteImagePathRequestSchema, recordingDateRequestSchema, updateNoteRequestSchema } from '@shared/schemas/ipc';

describe('IPC schemas', () => {
  it('validates calendar month requests', () => {
    expect(calendarMonthRequestSchema.parse({ year: 2026, month: 9 })).toEqual({ year: 2026, month: 9 });
    expect(() => calendarMonthRequestSchema.parse({ year: 2026, month: 0 })).toThrow();
    expect(() => calendarMonthRequestSchema.parse({ year: 2026, month: 13 })).toThrow();
  });

  it('validates recording date requests', () => {
    expect(recordingDateRequestSchema.parse({ date: '2026-09-04' })).toEqual({ date: '2026-09-04' });
    expect(() => recordingDateRequestSchema.parse({ date: '2026-9-4' })).toThrow();
  });

  it('validates note edit and image import requests', () => {
    expect(updateNoteRequestSchema.parse({
      noteId: 'note-1',
      title: '标题',
      plainText: '正文',
      contentJson: { type: 'doc', content: [] }
    })).toEqual({
      noteId: 'note-1',
      title: '标题',
      plainText: '正文',
      contentJson: { type: 'doc', content: [] }
    });
    expect(noteImagePathRequestSchema.parse({ filePath: 'C:\\tmp\\photo.png' })).toEqual({ filePath: 'C:\\tmp\\photo.png' });
    expect(() => updateNoteRequestSchema.parse({ noteId: 'note-1', title: '标题', plainText: '正文', contentJson: {} })).toThrow();
    expect(() => noteImagePathRequestSchema.parse({ filePath: '' })).toThrow();
  });
});
