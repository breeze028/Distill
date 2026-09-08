import type { AgentModel, AgentModelMessage, AgentModelToolCall } from '@main/agent/models/types';
import { ToolRegistry } from '@main/agent/tools/toolRegistry';
import type { AgentScope, AgentSource, AgentTraceStep, AgentUsage } from '@shared/types/domain';
import { logger } from '@main/logging/logger';

export type AgentRuntimeInput = {
  messages: AgentModelMessage[];
  scope: AgentScope;
  model: string;
  maxSteps?: number;
};

export type AgentRuntimeResult = {
  answer: string;
  sources: AgentSource[];
  trace: AgentTraceStep[];
  usage?: AgentUsage;
};

export class AgentRuntime {
  constructor(
    private readonly model: AgentModel,
    private readonly tools: ToolRegistry,
    private readonly options: { maxSteps?: number } = {}
  ) {}

  async run(input: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    const maxSteps = input.maxSteps ?? this.options.maxSteps ?? 8;
    const messages = [...input.messages];
    const trace: AgentTraceStep[] = [];
    const sources: AgentSource[] = [];
    const usage: AgentUsage = {};

    for (let step = 1; step <= maxSteps; step += 1) {
      const modelStartedAt = Date.now();
      const response = await this.model.complete({
        messages,
        tools: this.tools.definitions(),
        model: input.model
      });
      addUsage(usage, response.usage);
      trace.push({
        step,
        type: 'model',
        model: response.model ?? input.model,
        durationMs: Date.now() - modelStartedAt,
        success: true,
        usage: response.usage
      });

      if (response.toolCalls.length === 0) {
        return {
          answer: response.content?.trim() || '我在现有记录里没有找到足够依据。',
          sources: dedupeSources(sources),
          trace,
          usage: hasUsage(usage) ? usage : undefined
        };
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls
      });

      for (const toolCall of response.toolCalls) {
        const toolStartedAt = Date.now();
        const result = await this.tools.execute(toolCall.name, toolCall.arguments, { scope: input.scope });
        sources.push(...result.sources);
        trace.push({
          step,
          type: 'tool',
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          durationMs: Date.now() - toolStartedAt,
          success: result.ok,
          errorMessage: result.error?.message
        });
        logger.info('AgentRuntime', result.ok ? 'Tool executed' : 'Tool failed', {
          toolName: toolCall.name,
          durationMs: Date.now() - toolStartedAt,
          success: result.ok,
          errorCode: result.error?.code
        });
        messages.push(toToolMessage(toolCall, result.content));
      }
    }

    return {
      answer: '这次检索步骤太多，我先停在这里。请换一个更具体的问题再试一次。',
      sources: dedupeSources(sources),
      trace,
      usage: hasUsage(usage) ? usage : undefined
    };
  }
}

function toToolMessage(toolCall: AgentModelToolCall, content: string): AgentModelMessage {
  return {
    role: 'tool',
    toolCallId: toolCall.id,
    name: toolCall.name,
    content
  };
}

function addUsage(total: AgentUsage, next: AgentUsage | undefined): void {
  if (!next) {
    return;
  }
  total.promptTokens = addOptional(total.promptTokens, next.promptTokens);
  total.completionTokens = addOptional(total.completionTokens, next.completionTokens);
  total.totalTokens = addOptional(total.totalTokens, next.totalTokens);
}

function addOptional(left: number | undefined, right: number | undefined): number | undefined {
  return right === undefined ? left : (left ?? 0) + right;
}

function hasUsage(usage: AgentUsage): boolean {
  return usage.promptTokens !== undefined || usage.completionTokens !== undefined || usage.totalTokens !== undefined;
}

function dedupeSources(sources: AgentSource[]): AgentSource[] {
  const seen = new Set<string>();
  const deduped: AgentSource[] = [];
  for (const source of sources) {
    const key = source.kind === 'recording'
      ? `recording:${source.recordingId}:${source.segmentId ?? ''}:${source.startTime ?? ''}`
      : `note:${source.noteId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(source);
  }
  return deduped;
}
