import type { AgentModel, AgentModelRequest, AgentModelResponse } from './types';

export class FakeAgentModel implements AgentModel {
  readonly id = 'fake';
  private index = 0;

  constructor(private readonly responses: AgentModelResponse[]) {}

  async complete(_request: AgentModelRequest): Promise<AgentModelResponse> {
    const response = this.responses[this.index];
    this.index += 1;
    if (!response) {
      return {
        content: 'No scripted response.',
        toolCalls: []
      };
    }

    return response;
  }
}
