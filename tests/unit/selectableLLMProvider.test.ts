import { describe, expect, it } from 'vitest';
import { SelectableLLMProvider } from '@main/llm/selectableLLMProvider';
import type { LLMProvider, LLMRequest, LLMResponse } from '@main/llm/types';

describe('SelectableLLMProvider', () => {
  it('uses the provider selected by settings', async () => {
    const provider = new SelectableLLMProvider(
      { getSettings: () => ({ aiProvider: 'mock' }) },
      {
        deepseek: new NamedLLMProvider('deepseek'),
        mock: new NamedLLMProvider('mock')
      }
    );

    const response = await provider.generate(request());

    expect(provider.id).toBe('mock');
    expect(response.content.title).toBe('mock');
  });

  it('falls back to DeepSeek for unknown providers', async () => {
    const provider = new SelectableLLMProvider(
      { getSettings: () => ({ aiProvider: 'unknown' }) },
      {
        deepseek: new NamedLLMProvider('deepseek'),
        mock: new NamedLLMProvider('mock')
      }
    );

    const response = await provider.generate(request());

    expect(provider.id).toBe('deepseek');
    expect(response.content.title).toBe('deepseek');
  });
});

class NamedLLMProvider implements LLMProvider {
  constructor(readonly id: string) {}

  async generate(_request: LLMRequest): Promise<LLMResponse> {
    return {
      rawResponse: this.id,
      content: {
        title: this.id,
        summary: `${this.id} summary`,
        keyPoints: [],
        todos: [],
        tags: []
      }
    };
  }
}

function request(): LLMRequest {
  return {
    transcript: 'hello',
    templateId: 'default-summary',
    prompt: 'Return JSON',
    model: 'deepseek-v4-flash'
  };
}
