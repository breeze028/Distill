import type { z } from 'zod';
import type { AgentScope, AgentSource } from '@shared/types/domain';

export type AgentToolContext = {
  scope: AgentScope;
};

export type AgentToolResult<TOutput = unknown> = {
  data: TOutput;
  sources: AgentSource[];
};

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType<TInput>;
  execute(input: TInput, context: AgentToolContext): Promise<AgentToolResult<TOutput>>;
}

export type AgentToolExecutionResult = {
  ok: boolean;
  content: string;
  sources: AgentSource[];
  error?: {
    code: 'unknown_tool' | 'invalid_arguments' | 'tool_error';
    message: string;
  };
};
