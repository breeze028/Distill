import { create } from 'zustand';
import type { AgentConversation, AgentConversationDetail, AgentRunResult, AgentScope, AgentTraceStep } from '@shared/types/domain';

type AssistantState = {
  open: boolean;
  conversations: AgentConversation[];
  activeConversation: AgentConversationDetail | null;
  loading: boolean;
  running: boolean;
  error: string | null;
  lastTrace: AgentTraceStep[];
  setOpen(open: boolean): void;
  toggleOpen(): void;
  load(): Promise<void>;
  selectConversation(id: string): Promise<void>;
  startNew(): void;
  ask(question: string, scope: AgentScope): Promise<AgentRunResult | null>;
};

export const useAssistantStore = create<AssistantState>((set, get) => ({
  open: false,
  conversations: [],
  activeConversation: null,
  loading: false,
  running: false,
  error: null,
  lastTrace: [],

  setOpen(open) {
    set({ open });
    if (open) {
      void get().load();
    }
  },

  toggleOpen() {
    get().setOpen(!get().open);
  },

  async load() {
    set({ loading: true, error: null });
    try {
      const conversations = await window.distillAPI.listAssistantConversations();
      const active = get().activeConversation;
      const activeConversation = active
        ? await window.distillAPI.getAssistantConversation({ conversationId: active.id })
        : null;
      set({
        conversations,
        activeConversation,
        loading: false
      });
    } catch (error) {
      set({ error: toMessage(error), loading: false });
    }
  },

  async selectConversation(id) {
    set({ loading: true, error: null });
    try {
      const activeConversation = await window.distillAPI.getAssistantConversation({ conversationId: id });
      set({ activeConversation, loading: false });
    } catch (error) {
      set({ error: toMessage(error), loading: false });
    }
  },

  startNew() {
    set({ activeConversation: null, error: null, lastTrace: [] });
  },

  async ask(question, scope) {
    const trimmed = question.trim();
    if (!trimmed || get().running) {
      return null;
    }

    const current = get().activeConversation;
    const optimisticConversation: AgentConversationDetail = current ?? {
      id: 'pending',
      title: trimmed.slice(0, 40),
      scope,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    set({
      running: true,
      error: null,
      activeConversation: {
        ...optimisticConversation,
        messages: [
          ...optimisticConversation.messages,
          {
            id: `pending-user-${Date.now()}`,
            conversationId: optimisticConversation.id,
            role: 'user',
            content: trimmed,
            sources: [],
            createdAt: new Date().toISOString()
          }
        ]
      }
    });

    try {
      const result = await window.distillAPI.runAssistant({
        conversationId: current?.id,
        question: trimmed,
        scope
      });
      const conversations = await window.distillAPI.listAssistantConversations();
      set({
        conversations,
        activeConversation: result.conversation,
        lastTrace: result.trace,
        running: false
      });
      return result;
    } catch (error) {
      set({ error: toMessage(error), running: false });
      return null;
    }
  }
}));

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
