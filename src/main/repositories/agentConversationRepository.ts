import crypto from 'node:crypto';
import type { SqliteDatabase } from '@main/database/database';
import { agentScopeSchema, agentSourceSchema } from '@shared/schemas/agent';
import type { AgentConversation, AgentConversationDetail, AgentConversationMessage, AgentScope, AgentSource } from '@shared/types/domain';

type ConversationRow = {
  id: string;
  title: string | null;
  scope_json: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources_json: string;
  created_at: string;
};

export class AgentConversationRepository {
  constructor(private readonly db: SqliteDatabase) {}

  listConversations(): AgentConversation[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_conversation ORDER BY updated_at DESC, rowid DESC')
      .all() as ConversationRow[];
    return rows.map(toConversation);
  }

  getConversation(id: string): AgentConversationDetail | null {
    const row = this.db.prepare('SELECT * FROM agent_conversation WHERE id = ?').get(id) as ConversationRow | undefined;
    if (!row) {
      return null;
    }

    const messages = this.db
      .prepare('SELECT * FROM agent_message WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(id) as MessageRow[];

    return {
      ...toConversation(row),
      messages: messages.map(toMessage)
    };
  }

  createConversation(scope: AgentScope, title: string | null = null): AgentConversationDetail {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO agent_conversation (id, title, scope_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, title, JSON.stringify(scope), now, now);

    const conversation = this.getConversation(id);
    if (!conversation) {
      throw new Error('Agent conversation was inserted but could not be loaded.');
    }
    return conversation;
  }

  touchConversation(id: string, title?: string | null): void {
    const now = new Date().toISOString();
    if (title !== undefined) {
      this.db.prepare('UPDATE agent_conversation SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);
      return;
    }

    this.db.prepare('UPDATE agent_conversation SET updated_at = ? WHERE id = ?').run(now, id);
  }

  addMessage(input: {
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: AgentSource[];
  }): AgentConversationMessage {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const sources = input.sources ?? [];
    this.db
      .prepare('INSERT INTO agent_message (id, conversation_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.conversationId, input.role, input.content, JSON.stringify(sources), now);
    this.touchConversation(input.conversationId);

    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      sources,
      createdAt: now
    };
  }
}

function toConversation(row: ConversationRow): AgentConversation {
  return {
    id: row.id,
    title: row.title,
    scope: parseScope(row.scope_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toMessage(row: MessageRow): AgentConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    sources: parseSources(row.sources_json),
    createdAt: row.created_at
  };
}

function parseScope(raw: string): AgentScope {
  try {
    return agentScopeSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    return { kind: 'all' };
  }
}

function parseSources(raw: string): AgentSource[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((source) => agentSourceSchema.parse(source)) : [];
  } catch {
    return [];
  }
}
