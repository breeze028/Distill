import type { AgentModel, AgentModelRequest, AgentModelResponse } from './types';

type AgentModelSettings = {
  getSettings(): { aiProvider: string };
};

export class SelectableAgentModel implements AgentModel {
  constructor(
    private readonly settings: AgentModelSettings,
    private readonly providers: Record<string, AgentModel>,
    private readonly fallbackProviderId = 'deepseek'
  ) {}

  get id(): string {
    return this.currentProvider().id;
  }

  async complete(request: AgentModelRequest): Promise<AgentModelResponse> {
    return this.currentProvider().complete(request);
  }

  private currentProvider(): AgentModel {
    const providerId = this.settings.getSettings().aiProvider;
    return this.providers[providerId] ?? this.providers[this.fallbackProviderId];
  }
}
