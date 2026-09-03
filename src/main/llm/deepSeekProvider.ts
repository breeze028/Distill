import { parseAIArtifactContent } from '@shared/schemas/ai';
import type { LLMProvider, LLMRequest, LLMResponse } from './types';

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

    if (!response.ok) {
      throw new Error(`DeepSeek request failed with status ${response.status}.`);
    }

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawContent = json.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('DeepSeek response did not include message content.');
    }

    return {
      content: parseAIArtifactContent(rawContent),
      rawResponse: rawContent
    };
  }
}
