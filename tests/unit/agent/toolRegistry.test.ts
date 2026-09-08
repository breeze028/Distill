import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '@main/agent/tools/toolRegistry';
import type { AgentTool } from '@main/agent/tools/types';

describe('ToolRegistry', () => {
  it('exports tool definitions and validates arguments with Zod', async () => {
    const registry = new ToolRegistry([
      testTool('echo', z.object({ text: z.string().min(1) }), async (input) => ({
        data: { echoed: input.text },
        sources: []
      }))
    ]);

    expect(registry.definitions()[0]?.name).toBe('echo');

    const result = await registry.execute('echo', { text: '' }, { scope: { kind: 'all' } });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('invalid_arguments');
  });

  it('handles unknown tools and tool errors as structured results', async () => {
    const registry = new ToolRegistry([
      testTool('fail', z.object({}), async () => {
        throw new Error('boom');
      })
    ]);

    const unknown = await registry.execute('missing', {}, { scope: { kind: 'all' } });
    const failed = await registry.execute('fail', {}, { scope: { kind: 'all' } });

    expect(unknown.error?.code).toBe('unknown_tool');
    expect(failed.error?.code).toBe('tool_error');
    expect(failed.content).toContain('boom');
  });

  it('rejects duplicate tool names', () => {
    const tool = testTool('same', z.object({}), async () => ({ data: {}, sources: [] }));

    expect(() => new ToolRegistry([tool, tool])).toThrow(/already registered/);
  });
});

function testTool<TInput>(
  name: string,
  schema: z.ZodType<TInput>,
  execute: AgentTool<TInput>['execute']
): AgentTool<TInput> {
  return {
    name,
    description: name,
    schema,
    execute
  };
}
