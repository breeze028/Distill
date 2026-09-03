import type { LLMProvider, LLMRequest, LLMResponse } from './types';

type LLMSettings = {
  getSettings(): { aiProvider: string };
};

export class SelectableLLMProvider implements LLMProvider {
  constructor(
    private readonly settings: LLMSettings,
    private readonly providers: Record<string, LLMProvider>,
    private readonly fallbackProviderId = 'deepseek'
  ) {}

  get id(): string {
    return this.currentProvider().id;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    return this.currentProvider().generate(request);
  }

  private currentProvider(): LLMProvider {
    const providerId = this.settings.getSettings().aiProvider;
    return this.providers[providerId] ?? this.providers[this.fallbackProviderId];
  }
}
