import type { AgentModel, AgentModelRequest, AgentModelResponse } from './types';

export class MockAgentModel implements AgentModel {
  readonly id = 'mock';

  async complete(request: AgentModelRequest): Promise<AgentModelResponse> {
    const delayMs = Number(process.env.DISTILL_MOCK_AGENT_DELAY_MS ?? process.env.DISTILL_MOCK_LLM_DELAY_MS ?? 0);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const toolMessages = request.messages.filter((message) => message.role === 'tool');
    const lastTool = toolMessages[toolMessages.length - 1];
    if (lastTool) {
      if (lastTool.name === 'search_library') {
        const parsed = parseToolContent(lastTool.content);
        const firstItem = Array.isArray(parsed.items) ? parsed.items[0] : null;
        if (firstItem?.kind === 'note') {
          return {
            content: null,
            toolCalls: [{ id: 'mock-get-note', name: 'get_note', arguments: { noteId: firstItem.id } }],
            model: request.model
          };
        }
        if (firstItem?.kind === 'recording') {
          return {
            content: null,
            toolCalls: [{ id: 'mock-get-recording', name: 'get_recording', arguments: { recordingId: firstItem.id } }],
            model: request.model
          };
        }
      }

      return {
        content: buildAnswerFromTools(toolMessages),
        toolCalls: [],
        model: request.model
      };
    }

    const question = [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    if (/D3D12|Descriptor Heap/i.test(question)) {
      return {
        content: 'D3D12 Descriptor Heap 是 Direct3D 12 中存放 descriptor 的连续区域，常用于让 GPU 访问资源视图、采样器等绑定信息。',
        toolCalls: [],
        model: request.model
      };
    }

    return {
      content: null,
      toolCalls: [{
        id: 'mock-search-library',
        name: 'search_library',
        arguments: {
          query: extractSearchQuery(question),
          kind: /笔记|写过/.test(question) ? 'note' : 'all',
          limit: 5
        }
      }],
      model: request.model
    };
  }
}

function extractSearchQuery(question: string): string {
  const quoted = question.match(/[“"']([^”"']+)[”"']/)?.[1];
  if (quoted) {
    return quoted;
  }

  const keywords = ['周末', '摄影', '工作', '独居', '无聊'];
  return keywords.find((keyword) => question.includes(keyword)) ?? question.replace(/[？?。]/g, ' ').trim().slice(0, 40);
}

function buildAnswerFromTools(toolMessages: Array<{ name: string; content: string }>): string {
  const searchContent = toolMessages.find((message) => message.name === 'search_library')?.content;
  const search = searchContent ? parseToolContent(searchContent) : null;
  const items = search && Array.isArray(search.items) ? search.items as Array<{ title?: string }> : [];
  const count = items.length;
  if (count === 0) {
    return '我在现有记录里没有找到足够依据。';
  }

  const first = items[0];
  return [
    `## 我找到了 ${count} 条相关资料`,
    '',
    `最直接的一条是 **「${first.title}」**。`,
    '',
    '- 这个主题确实曾经出现过。',
    '- 你可以点击下面的来源回到原文。'
  ].join('\n');
}

function parseToolContent(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}
