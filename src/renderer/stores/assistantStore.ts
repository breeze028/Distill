import { create } from 'zustand';
import type { AgentConversation, AgentConversationDetail, AgentRunResult, AgentScope, AgentTraceStep } from '@shared/types/domain';

type AssistantState = {
  open: boolean;
  conversations: AgentConversation[];
  selectedConversationId: string | null;
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

let conversationRequestVersion = 0;

export const useAssistantStore = create<AssistantState>((set, get) => ({
  open: false,
  conversations: [],
  selectedConversationId: null,
  activeConversation: null,
  loading: false,
  running: false,
  error: null,
  lastTrace: [],

  setOpen(open) {
    if (!open) {
      conversationRequestVersion += 1;
      set({ open: false, loading: false });
      return;
    }

    set({ open: true });
    void get().load();
  },

  toggleOpen() {
    get().setOpen(!get().open);
  },

  async load() {
    const requestVersion = ++conversationRequestVersion;
    set({ loading: true, error: null });
    try {
      const conversations = await window.distillAPI.listAssistantConversations();
      const state = get();
      const selectedConversationId = state.selectedConversationId ?? state.activeConversation?.id ?? null;
      const selectedConversationExists = conversations.some(
        (conversation) => conversation.id === selectedConversationId
      );
      const activeConversation = selectedConversationExists && selectedConversationId
        ? await window.distillAPI.getAssistantConversation({ conversationId: selectedConversationId })
        : null;

      if (requestVersion !== conversationRequestVersion) {
        return;
      }

      set({
        conversations,
        selectedConversationId: activeConversation?.id ?? null,
        activeConversation,
        loading: false
      });
    } catch (error) {
      if (requestVersion !== conversationRequestVersion) {
        return;
      }
      set({ error: toMessage(error), loading: false });
    }
  },

  async selectConversation(id) {
    const requestVersion = ++conversationRequestVersion;
    const previousConversationId = get().activeConversation?.id ?? null;
    set({ selectedConversationId: id, loading: true, error: null });
    try {
      const activeConversation = await window.distillAPI.getAssistantConversation({ conversationId: id });
      if (requestVersion !== conversationRequestVersion) {
        return;
      }
      if (!activeConversation) {
        throw new Error('Conversation no longer exists.');
      }
      set({ activeConversation, loading: false });
    } catch (error) {
      if (requestVersion !== conversationRequestVersion) {
        return;
      }
      set({
        selectedConversationId: previousConversationId,
        error: toMessage(error),
        loading: false
      });
    }
  },

  startNew() {
    if (get().running) {
      return;
    }
    conversationRequestVersion += 1;
    set({
      selectedConversationId: null,
      activeConversation: null,
      loading: false,
      error: null,
      lastTrace: []
    });
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
        selectedConversationId: result.conversation.id,
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
