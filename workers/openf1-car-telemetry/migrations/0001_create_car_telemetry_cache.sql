CREATE TABLE IF NOT EXISTS car_telemetry_cache (
  session_key INTEGER PRIMARY KEY,
  r2_key TEXT,
  payload_size INTEGER,
  created_at TEXT NOT NULL
);

