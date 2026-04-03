ALTER TABLE warm_session_attempts ADD COLUMN meeting_name TEXT;
ALTER TABLE warm_session_attempts ADD COLUMN session_name TEXT;

CREATE TABLE IF NOT EXISTS warm_worker_state (
  state_key TEXT PRIMARY KEY,
  state_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
