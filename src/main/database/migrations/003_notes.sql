CREATE TABLE IF NOT EXISTS note (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  plain_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  note_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61'
);

CREATE INDEX IF NOT EXISTS idx_note_updated_at ON note(updated_at);
