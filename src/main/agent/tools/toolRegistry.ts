import { z } from 'zod';
import type { AgentModelToolDefinition } from '@main/agent/models/types';
import type { AgentSource } from '@shared/types/domain';
import type { AgentTool, AgentToolContext, AgentToolExecutionResult } from './types';

type ToolErrorCode = NonNullable<AgentToolExecutionResult['error']>['code'];

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor(tools: AgentTool[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Agent tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  definitions(): AgentModelToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.schema)
    }));
  }

  async execute(name: string, rawInput: unknown, context: AgentToolContext): Promise<AgentToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return toolError('unknown_tool', `Unknown tool: ${name}`);
    }

    const parsed = tool.schema.safeParse(rawInput);
    if (!parsed.success) {
      return toolError('invalid_arguments', z.prettifyError(parsed.error));
    }

    try {
      const result = await tool.execute(parsed.data, context);
      return {
        ok: true,
        content: JSON.stringify(result.data),
        sources: dedupeSources(result.sources)
      };
    } catch (error) {
      return toolError('tool_error', error instanceof Error ? error.message : String(error));
    }
  }
}

function toolError(code: ToolErrorCode, message: string): AgentToolExecutionResult {
  return {
    ok: false,
    content: JSON.stringify({ error: { code, message } }),
    sources: [],
    error: { code, message }
  };
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
