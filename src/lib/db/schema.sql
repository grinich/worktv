CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  duration INTEGER NOT NULL,
  space TEXT DEFAULT 'Zoom Meetings',
  source TEXT DEFAULT 'zoom',
  media_type TEXT DEFAULT 'video',
  media_url_expires_at TEXT,
  created_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_files (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL,
  view_type TEXT NOT NULL,
  video_url TEXT NOT NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_video_files_recording ON video_files(recording_id);

CREATE TABLE IF NOT EXISTS speakers (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segments_recording ON segments(recording_id);
CREATE INDEX IF NOT EXISTS idx_speakers_recording ON speakers(recording_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL,
  timestamp REAL NOT NULL,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_recording ON chat_messages(recording_id);
CREATE INDEX IF NOT EXISTS idx_recordings_source ON recordings(source);

CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  model TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_summaries_recording ON summaries(recording_id);

-- Migration: Add new columns to existing recordings table
-- These statements are safe to run multiple times (handled by db init code)
-- MIGRATION:ADD_COLUMN:recordings:source:TEXT DEFAULT 'zoom'
-- MIGRATION:ADD_COLUMN:recordings:media_type:TEXT DEFAULT 'video'
-- MIGRATION:ADD_COLUMN:recordings:media_url_expires_at:TEXT
