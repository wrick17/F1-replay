export const SUPPORTED_SESSION_TYPES = ["Race", "Sprint", "Qualifying"] as const;
export type SupportedSessionType = (typeof SUPPORTED_SESSION_TYPES)[number];

export const RETRY_INTERVAL_MS = 60 * 60 * 1000;
export const OPENF1_NO_DATA_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const RETRY_WINDOW_MS = 12 * 60 * 60 * 1000;
export const OPENF1_NO_DATA_RETRY_WINDOW_MS = 72 * 60 * 60 * 1000;
export const OPENF1_NO_DATA_ERROR_PREFIX = "OPENF1_NO_DATA:";

export type CacheState = "pending" | "missing" | "hit" | "warmed" | "failed";

export type WarmAttemptRow = {
  session_key: number;
  meeting_key: number;
  meeting_name: string | null;
  year: number;
  round: number;
  session_type: string;
  session_name: string | null;
  date_end: string;
  replay_status: CacheState;
  telemetry_status: CacheState;
  attempt_count: number;
  warm_in_progress: number;
  warm_started_at: string | null;
  last_attempt_at: string | null;
  next_retry_at: string;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const isSupportedSessionType = (value: string): value is SupportedSessionType =>
  SUPPORTED_SESSION_TYPES.includes(value as SupportedSessionType);

export const withinRetryWindow = (dateEndIso: string, nowMs: number) => {
  return withinRetryWindowFor(dateEndIso, nowMs, RETRY_WINDOW_MS);
};

export const withinRetryWindowFor = (dateEndIso: string, nowMs: number, retryWindowMs: number) => {
  const endMs = Date.parse(dateEndIso);
  if (!Number.isFinite(endMs)) return false;
  return nowMs <= endMs + retryWindowMs;
};

export const getNextRetryAt = (nowMs: number, intervalMs = RETRY_INTERVAL_MS) =>
  new Date(nowMs + intervalMs).toISOString();

export const isOpenF1NoDataError = (lastError: string | null | undefined) =>
  Boolean(
    lastError &&
      (lastError.startsWith(OPENF1_NO_DATA_ERROR_PREFIX) ||
        lastError.includes("Replay payload has no drivers yet") ||
        lastError.includes("Replay payload has no location/position telemetry yet") ||
        lastError.includes("Car telemetry payload has no samples yet") ||
        lastError.includes("OpenF1 request failed: 404")),
  );

export const getRetryWindowMsForRow = (row: Pick<WarmAttemptRow, "last_error">) =>
  isOpenF1NoDataError(row.last_error) ? OPENF1_NO_DATA_RETRY_WINDOW_MS : RETRY_WINDOW_MS;

export const isRetryableStatus = (status: number) =>
  status === 404 || status === 429 || (status >= 500 && status < 600);

export const isAuthStatus = (status: number) => status === 401;

export const isEligibleRow = (row: WarmAttemptRow, nowMs: number) => {
  if (row.completed_at) return false;
  if (row.warm_in_progress) return false;
  if (!isSupportedSessionType(row.session_type)) return false;
  if (!withinRetryWindowFor(row.date_end, nowMs, getRetryWindowMsForRow(row))) return false;
  const nextRetryMs = Date.parse(row.next_retry_at);
  if (!Number.isFinite(nextRetryMs)) return false;
  return nextRetryMs <= nowMs;
};

export const deriveWarmActions = (input: { replayHit: boolean; telemetryHit: boolean }) => {
  const warmReplay = !input.replayHit;
  const warmTelemetry = !input.telemetryHit;
  const complete = input.replayHit && input.telemetryHit;
  return {
    warmReplay,
    warmTelemetry,
    complete,
  };
};
