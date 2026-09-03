import { describe, expect, it } from 'vitest';
import { builtInTemplates, listBuiltInTemplateMetadata } from '@main/llm/templates';

describe('AI template metadata', () => {
  it('exposes renderer-safe metadata without prompts or schemas', () => {
    const metadata = listBuiltInTemplateMetadata();

    expect(metadata).toHaveLength(builtInTemplates.length);
    expect(metadata.map((template) => template.id)).toContain('technical-thinking');
    expect(metadata[0]).toEqual({
      id: builtInTemplates[0].id,
      name: builtInTemplates[0].name,
      description: builtInTemplates[0].description,
      promptVersion: builtInTemplates[0].promptVersion
    });
    expect(metadata[0]).not.toHaveProperty('prompt');
    expect(metadata[0]).not.toHaveProperty('outputSchema');
  });
});
