CREATE TABLE IF NOT EXISTS replay_cache (
  session_key INTEGER PRIMARY KEY,
  payload TEXT NOT NULL DEFAULT '',
  r2_key TEXT,
  payload_size INTEGER,
  created_at TEXT NOT NULL
);
