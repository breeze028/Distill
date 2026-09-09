import { AgentModelError, type AgentModel, type AgentModelMessage, type AgentModelRequest, type AgentModelResponse } from './types';

type DeepSeekMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    }
  | {
      role: 'tool';
      tool_call_id: string;
      content: string;
    };

type DeepSeekResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class DeepSeekAgentModel implements AgentModel {
  readonly id = 'deepseek';

  constructor(private readonly apiKey: string | (() => string)) {}

  async complete(request: AgentModelRequest): Promise<AgentModelResponse> {
    const apiKey = typeof this.apiKey === 'function' ? this.apiKey() : this.apiKey;
    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured.');
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map(toDeepSeekMessage),
        tools: request.tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        })),
        tool_choice: 'auto'
      })
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new AgentModelError(formatDeepSeekHttpError(response.status), {
        status: response.status,
        rawResponse: responseText
      });
    }

    let json: DeepSeekResponse;
    try {
      json = JSON.parse(responseText) as DeepSeekResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentModelError(`DeepSeek 返回了无法解析的 Agent 响应：${message}`, { rawResponse: responseText });
    }

    const message = json.choices?.[0]?.message;
    if (!message) {
      throw new AgentModelError('DeepSeek Agent 响应中没有可用的 message。', { rawResponse: responseText });
    }

    return {
      content: message.content ?? null,
      toolCalls: (message.tool_calls ?? []).map((toolCall, index) => ({
        id: toolCall.id ?? `tool-call-${index + 1}`,
        name: toolCall.function?.name ?? '',
        arguments: parseToolArguments(toolCall.function?.arguments ?? '{}')
      })).filter((toolCall) => toolCall.name.length > 0),
      model: json.model,
      usage: {
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
        totalTokens: json.usage?.total_tokens
      }
    };
  }
}

function toDeepSeekMessage(message: AgentModelMessage): DeepSeekMessage {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content
    };
  }

  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.toolCalls?.map((toolCall) => ({
        id: toolCall.id,
        type: 'function' as const,
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments)
        }
      }))
    };
  }

  return message;
}

function parseToolArguments(raw: string): unknown {
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function formatDeepSeekHttpError(status: number): string {
  if (status === 401 || status === 403) {
    return 'DeepSeek API Key 无效或无权限。';
  }
  if (status === 429) {
    return 'DeepSeek 请求达到频率或额度限制。';
  }
  if (status >= 500) {
    return `DeepSeek 服务暂时不可用，HTTP ${status}。`;
  }
  return `DeepSeek 请求失败，HTTP ${status}。`;
}
