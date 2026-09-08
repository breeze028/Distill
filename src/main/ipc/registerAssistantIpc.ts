import { ipcMain } from 'electron';
import { ipcChannels } from '@shared/ipc';
import { agentConversationIdRequestSchema, agentRunRequestSchema } from '@shared/schemas/agent';
import type { AgentService } from '@main/services/agentService';

export function registerAssistantIpcHandlers(dependencies: { agent: AgentService }): void {
  ipcMain.handle(ipcChannels.assistantListConversations, () => dependencies.agent.listConversations());

  ipcMain.handle(ipcChannels.assistantGetConversation, (_event, input: unknown) => {
    const parsed = agentConversationIdRequestSchema.parse(input);
    return dependencies.agent.getConversation(parsed.conversationId);
  });

  ipcMain.handle(ipcChannels.assistantRun, (_event, input: unknown) => {
    const parsed = agentRunRequestSchema.parse(input);
    return dependencies.agent.run(parsed);
  });
}
