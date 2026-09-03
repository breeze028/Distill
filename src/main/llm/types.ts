import type { AIArtifactContent } from '@shared/types/domain';

export type LLMRequest = {
  transcript: string;
  templateId: string;
  prompt: string;
  model: string;
};

export type LLMResponse = {
  content: AIArtifactContent;
  rawResponse: string;
};

export interface LLMProvider {
  readonly id: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    readonly details: { status?: number; rawResponse?: string } = {}
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}
