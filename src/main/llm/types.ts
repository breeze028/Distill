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
