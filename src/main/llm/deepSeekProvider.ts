import { parseAIArtifactContent } from '@shared/schemas/ai';
import { LLMProviderError, type LLMProvider, type LLMRequest, type LLMResponse } from './types';

export class DeepSeekProvider implements LLMProvider {
  readonly id = 'deepseek';

  constructor(private readonly apiKey: string | (() => string)) {}

  async generate(request: LLMRequest): Promise<LLMResponse> {
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
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: request.prompt
          },
          {
            role: 'user',
            content: request.transcript
          }
        ]
      })
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new LLMProviderError(formatDeepSeekHttpError(response.status), {
        status: response.status,
        rawResponse: responseText
      });
    }

    let json: { choices?: Array<{ message?: { content?: string } }> };
    try {
      json = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LLMProviderError(`DeepSeek 返回了无法解析的响应：${message}`, { rawResponse: responseText });
    }

    const rawContent = json.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new LLMProviderError('DeepSeek 响应中没有可用的 message content。', { rawResponse: responseText });
    }

    try {
      return {
        content: parseAIArtifactContent(rawContent),
        rawResponse: rawContent
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LLMProviderError(`DeepSeek 返回的笔记 JSON 不符合 schema：${message}`, { rawResponse: rawContent });
    }
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
