import { describe, expect, it } from 'vitest';
import { calendarMonthRequestSchema, recordingDateRequestSchema } from '@shared/schemas/ipc';

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
});
