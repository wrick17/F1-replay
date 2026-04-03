CREATE TABLE IF NOT EXISTS warm_session_attempts (
  session_key INTEGER PRIMARY KEY,
  meeting_key INTEGER NOT NULL,
  year INTEGER NOT NULL,
  round INTEGER NOT NULL,
  session_type TEXT NOT NULL,
  date_end TEXT NOT NULL,
  replay_status TEXT NOT NULL DEFAULT 'pending',
  telemetry_status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
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
