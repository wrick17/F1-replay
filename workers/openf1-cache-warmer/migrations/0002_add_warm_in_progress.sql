ALTER TABLE warm_session_attempts ADD COLUMN warm_in_progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE warm_session_attempts ADD COLUMN warm_started_at TEXT;
