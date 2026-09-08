CREATE TABLE IF NOT EXISTS agent_conversation (
  id TEXT PRIMARY KEY,
  title TEXT,
  scope_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversation(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_conversation_updated_at ON agent_conversation(updated_at);
CREATE INDEX IF NOT EXISTS idx_agent_message_conversation_created ON agent_message(conversation_id, created_at);
