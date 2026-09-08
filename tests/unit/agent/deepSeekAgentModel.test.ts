import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekAgentModel } from '@main/agent/models/deepSeekAgentModel';
import { AgentModelError } from '@main/agent/models/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DeepSeekAgentModel', () => {
  it('sends chat messages with tool definitions and parses tool calls', async () => {
    const fetchMock = mockFetch(200, {
      model: 'deepseek-chat',
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'search_library',
                  arguments: '{"query":"摄影","kind":"note"}'
                }
              }
            ]
          }
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      }
    });
    const model = new DeepSeekAgentModel(() => 'test-key');

    const result = await model.complete({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: '我写过摄影吗？' }],
      tools: [
        {
          name: 'search_library',
          description: 'search',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' }
            },
            required: ['query']
          }
        }
      ]
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(firstCall[1].body) as {
      tools: Array<{ type: string; function: { name: string } }>;
      tool_choice: string;
    };
    expect(body.tools[0]?.type).toBe('function');
    expect(body.tools[0]?.function.name).toBe('search_library');
    expect(body.tool_choice).toBe('auto');
    expect(result.toolCalls[0]).toEqual({
      id: 'call-1',
      name: 'search_library',
      arguments: {
        query: '摄影',
        kind: 'note'
      }
    });
    expect(result.usage?.totalTokens).toBe(15);
  });

  it('returns a clear auth error without exposing the API key', async () => {
    mockFetch(401, { error: { message: 'bad key' } });
    const model = new DeepSeekAgentModel(() => 'secret-key');

    await expect(model.complete({ model: 'deepseek-chat', messages: [], tools: [] })).rejects.toMatchObject({
      message: 'DeepSeek API Key 无效或无权限。',
      details: {
        status: 401
      }
    });
    await expect(model.complete({ model: 'deepseek-chat', messages: [], tools: [] })).rejects.not.toThrow('secret-key');
  });

  it('reports malformed JSON responses', async () => {
    const fetchMock = vi.fn(async () => new Response('{bad json', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const model = new DeepSeekAgentModel(() => 'test-key');

    await expect(model.complete({ model: 'deepseek-chat', messages: [], tools: [] })).rejects.toBeInstanceOf(AgentModelError);
  });
});

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
