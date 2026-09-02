CREATE TABLE IF NOT EXISTS recording (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  normalized_file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_mtime_ms INTEGER NOT NULL,
  format TEXT NOT NULL,
  duration REAL,
  imported_at TEXT NOT NULL,
  created_at TEXT,
  processing_state TEXT NOT NULL DEFAULT 'pending',
  UNIQUE(normalized_file_path, file_size, file_mtime_ms)
);

CREATE TABLE IF NOT EXISTS transcript (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recording(id) ON DELETE CASCADE,
  language TEXT,
  duration REAL,
  full_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_segment (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL REFERENCES transcript(id) ON DELETE CASCADE,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_template (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  prompt TEXT NOT NULL,
  output_schema TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_artifact (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recording(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES ai_template(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  content_json TEXT NOT NULL,
  raw_response TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tag (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recording_tag (
  recording_id TEXT NOT NULL REFERENCES recording(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (recording_id, tag_id)
);

CREATE TABLE IF NOT EXISTS processing_job (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recording(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  error_message TEXT,
  error_detail TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS recording_fts USING fts5(
  recording_id UNINDEXED,
  title,
  transcript,
  ai_content,
  tags,
  tokenize = 'unicode61'
);

CREATE INDEX IF NOT EXISTS idx_recording_imported_at ON recording(imported_at);
CREATE INDEX IF NOT EXISTS idx_transcript_recording_id ON transcript(recording_id);
CREATE INDEX IF NOT EXISTS idx_segment_transcript_time ON transcript_segment(transcript_id, start_time);
CREATE INDEX IF NOT EXISTS idx_artifact_recording_template ON ai_artifact(recording_id, template_id, created_at);
CREATE INDEX IF NOT EXISTS idx_job_recording_state ON processing_job(recording_id, state);
