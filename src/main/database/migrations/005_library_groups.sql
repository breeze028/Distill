CREATE TABLE IF NOT EXISTS library_group (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_group_item (
  group_id TEXT NOT NULL REFERENCES library_group(id) ON DELETE CASCADE,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('recording', 'note')),
  item_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, item_kind, item_id)
);

CREATE INDEX IF NOT EXISTS idx_library_group_item_item ON library_group_item(item_kind, item_id);
