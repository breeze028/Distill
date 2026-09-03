import type { LLMProvider, LLMRequest, LLMResponse } from './types';

export class MockLLMProvider implements LLMProvider {
  readonly id = 'mock';

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const delayMs = Number(process.env.DISTILL_MOCK_LLM_DELAY_MS ?? 0);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const firstLine = request.transcript.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? '空转写';
    const content = {
      title: firstLine.slice(0, 32),
      summary: `整理自 ${request.templateId} 模板的模拟 AI 笔记。`,
      keyPoints: [firstLine],
      todos: [],
      tags: ['mock', 'ai-note']
    };

    return {
      content,
      rawResponse: JSON.stringify(content)
    };
  }
}
