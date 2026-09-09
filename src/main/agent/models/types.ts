export type AgentModelMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content: string | null;
      toolCalls?: AgentModelToolCall[];
    }
  | {
      role: 'tool';
      toolCallId: string;
      name: string;
      content: string;
    };

export type AgentModelToolDefinition = {
  name: string;
  description: string;
  parameters: unknown;
};

export type AgentModelToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type AgentModelUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AgentModelRequest = {
  messages: AgentModelMessage[];
  tools: AgentModelToolDefinition[];
  model: string;
};

export type AgentModelResponse = {
  content: string | null;
  toolCalls: AgentModelToolCall[];
  usage?: AgentModelUsage;
  model?: string;
};

export interface AgentModel {
  readonly id: string;
  complete(request: AgentModelRequest): Promise<AgentModelResponse>;
}

export class AgentModelError extends Error {
  constructor(
    message: string,
    readonly details: { status?: number; rawResponse?: string } = {}
  ) {
    super(message);
    this.name = 'AgentModelError';
  }
}
