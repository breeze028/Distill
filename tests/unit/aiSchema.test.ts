import { describe, expect, it } from 'vitest';
import { parseAIArtifactContent } from '@shared/schemas/ai';

describe('AI artifact schema', () => {
  it('parses valid structured JSON', () => {
    const parsed = parseAIArtifactContent(
      JSON.stringify({
        title: 'A note',
        summary: 'Short summary',
        keyPoints: ['one'],
        todos: [],
        tags: ['idea']
      })
    );

    expect(parsed.title).toBe('A note');
    expect(parsed.tags).toEqual(['idea']);
  });

  it('rejects malformed model output', () => {
    expect(() => parseAIArtifactContent(JSON.stringify({ title: '', summary: 'x' }))).toThrow();
  });
});
