import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@main/services/agentService';

describe('Agent system prompt', () => {
  it('anchors relative dates, output format, source grounding, and scope rules', () => {
    const prompt = buildSystemPrompt({
      kind: 'current',
      item: {
        kind: 'recording',
        id: 'recording-1'
      }
    }, new Date(2026, 8, 9, 10, 30));

    expect(prompt).toContain('Today is 2026-09-09');
    expect(prompt).toContain('concrete YYYY-MM-DD date ranges');
    expect(prompt).toContain('concise Markdown');
    expect(prompt).toContain('Do not emit HTML');
    expect(prompt).toContain('naming the relevant recording or note title and date');
    expect(prompt).toContain('Only answer from the selected recording (recording-1)');
    expect(prompt).toContain('switch Ask Distill to All Library');
    expect(prompt).toContain('Do not claim that no other library records exist');
  });
});
