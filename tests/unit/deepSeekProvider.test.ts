import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekProvider } from '@main/llm/deepSeekProvider';
import { LLMProviderError } from '@main/llm/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DeepSeekProvider', () => {
  it('sends transcript and parses structured JSON content', async () => {
    const content = {
      title: '录音摘要',
      summary: '整理后的摘要。',
      keyPoints: ['重点一'],
      todos: [],
      tags: ['voice']
    };
    const fetchMock = mockFetch(200, {
      choices: [{ message: { content: JSON.stringify(content) } }]
    });
    const provider = new DeepSeekProvider(() => 'test-key');

    const result = await provider.generate({
      transcript: '原始 transcript',
      templateId: 'default-summary',
      prompt: 'Return JSON',
      model: 'deepseek-chat'
    });

    expect(result.content.title).toBe('录音摘要');
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/chat/completions', expect.objectContaining({
      method: 'POST'
    }));
  });

  it('returns a clear auth error without exposing the API key', async () => {
    mockFetch(401, { error: { message: 'bad key' } });
    const provider = new DeepSeekProvider(() => 'secret-key');

    await expect(provider.generate(request())).rejects.toMatchObject({
      message: 'DeepSeek API Key 无效或无权限。',
      details: {
        status: 401
      }
    });
    await expect(provider.generate(request())).rejects.not.toThrow('secret-key');
  });

  it('preserves raw message content when DeepSeek returns invalid artifact JSON', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{"summary":"missing title"}' } }]
    });
    const provider = new DeepSeekProvider(() => 'test-key');

    await expect(provider.generate(request())).rejects.toMatchObject({
      name: 'LLMProviderError',
      details: {
        rawResponse: '{"summary":"missing title"}'
      }
    });
  });

  it('reports missing message content with the raw API response', async () => {
    mockFetch(200, { choices: [] });
    const provider = new DeepSeekProvider(() => 'test-key');

    await expect(provider.generate(request())).rejects.toBeInstanceOf(LLMProviderError);
  });
});

function request() {
  return {
    transcript: '原始 transcript',
    templateId: 'default-summary',
    prompt: 'Return JSON',
    model: 'deepseek-chat'
  };
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
