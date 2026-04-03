CREATE TABLE IF NOT EXISTS warm_session_attempts (
  session_key INTEGER PRIMARY KEY,
  meeting_key INTEGER NOT NULL,
  meeting_name TEXT,
  year INTEGER NOT NULL,
  round INTEGER NOT NULL,
  session_type TEXT NOT NULL,
  session_name TEXT,
  date_end TEXT NOT NULL,
  replay_status TEXT NOT NULL DEFAULT 'pending',
  telemetry_status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  warm_in_progress INTEGER NOT NULL DEFAULT 0,
  warm_started_at TEXT,
  last_attempt_at TEXT,
  next_retry_at TEXT NOT NULL,
  last_error TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warm_session_attempts_next_retry
ON warm_session_attempts (next_retry_at);

CREATE INDEX IF NOT EXISTS idx_warm_session_attempts_completed
ON warm_session_attempts (completed_at);

CREATE TABLE IF NOT EXISTS warm_worker_state (
  state_key TEXT PRIMARY KEY,
  state_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
