import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AgentRuntime } from '@main/agent/runtime';
import { FakeAgentModel } from '@main/agent/models/fakeAgentModel';
import { ToolRegistry } from '@main/agent/tools/toolRegistry';
import type { AgentTool } from '@main/agent/tools/types';

describe('AgentRuntime', () => {
  it('returns a final answer without calling tools', async () => {
    const runtime = new AgentRuntime(new FakeAgentModel([
      { content: 'Direct answer.', toolCalls: [], usage: { totalTokens: 3 }, model: 'fake' }
    ]), new ToolRegistry());

    const result = await runtime.run({
      messages: [{ role: 'user', content: 'D3D12 Descriptor Heap 是什么？' }],
      scope: { kind: 'all' },
      model: 'fake'
    });

    expect(result.answer).toBe('Direct answer.');
    expect(result.trace).toHaveLength(1);
    expect(result.usage?.totalTokens).toBe(3);
  });

  it('executes one tool call and collects sources', async () => {
    const runtime = new AgentRuntime(new FakeAgentModel([
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: 'search_library', arguments: { query: '周末' } }],
        model: 'fake'
      },
      { content: '找到了周末相关记录。', toolCalls: [], model: 'fake' }
    ]), new ToolRegistry([
      testTool('search_library', z.object({ query: z.string() }), async () => ({
        data: { items: [{ kind: 'recording', id: 'rec-1', title: '周末', date: '2026-09-01', snippet: '周末很无聊' }] },
        sources: [{ kind: 'recording', recordingId: 'rec-1', title: '周末', date: '2026-09-01', snippet: '周末很无聊' }]
      }))
    ]));

    const result = await runtime.run({
      messages: [{ role: 'user', content: '我以前有没有提过周末很无聊？' }],
      scope: { kind: 'all' },
      model: 'fake'
    });

    expect(result.answer).toBe('找到了周末相关记录。');
    expect(result.sources).toEqual([{ kind: 'recording', recordingId: 'rec-1', title: '周末', date: '2026-09-01', snippet: '周末很无聊' }]);
    expect(result.trace.map((step) => step.type)).toEqual(['model', 'tool', 'model']);
  });

  it('supports multiple sequential tool calls', async () => {
    const runtime = new AgentRuntime(new FakeAgentModel([
      { content: null, toolCalls: [{ id: 'call-1', name: 'search_library', arguments: { query: '摄影' } }] },
      { content: null, toolCalls: [{ id: 'call-2', name: 'get_note', arguments: { noteId: 'note-1' } }] },
      { content: '摄影笔记找到了。', toolCalls: [] }
    ]), new ToolRegistry([
      testTool('search_library', z.object({ query: z.string() }), async () => ({ data: { items: [] }, sources: [] })),
      testTool('get_note', z.object({ noteId: z.string() }), async () => ({
        data: { title: '摄影' },
        sources: [{ kind: 'note', noteId: 'note-1', title: '摄影', date: '2026-09-02', snippet: '想学摄影' }]
      }))
    ]));

    const result = await runtime.run({
      messages: [{ role: 'user', content: '我之前写过哪些关于摄影的笔记？' }],
      scope: { kind: 'all' },
      model: 'fake'
    });

    expect(result.answer).toBe('摄影笔记找到了。');
    expect(result.sources[0]).toMatchObject({ kind: 'note', noteId: 'note-1' });
  });

  it('stops at maxSteps', async () => {
    const runtime = new AgentRuntime(new FakeAgentModel([
      { content: null, toolCalls: [{ id: 'call-1', name: 'loop', arguments: {} }] },
      { content: null, toolCalls: [{ id: 'call-2', name: 'loop', arguments: {} }] }
    ]), new ToolRegistry([
      testTool('loop', z.object({}), async () => ({ data: {}, sources: [] }))
    ]));

    const result = await runtime.run({
      messages: [{ role: 'user', content: 'loop' }],
      scope: { kind: 'all' },
      model: 'fake',
      maxSteps: 2
    });

    expect(result.answer).toContain('步骤太多');
    expect(result.trace.filter((step) => step.type === 'model')).toHaveLength(2);
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
