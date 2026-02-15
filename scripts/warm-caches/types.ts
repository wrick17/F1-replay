export type CachePhase = "pending" | "in_progress" | "hit" | "warmed" | "failed";

export type CacheTaskStatus = {
  phase: CachePhase;
  xCache?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  error?: string | null;
};

export type WarmSessionRow = {
  key: string; // stable composite id for UI, not the OpenF1 session_key
  sessionKey: number;
  meetingKey: number;
  year: number;
  round: number;
  meetingName: string;
  countryName: string;
  circuitShortName: string;
  sessionType: string;
  sessionName: string;
  dateStart: string;
  dateEnd: string;
  replay: CacheTaskStatus;
  carTelemetry: CacheTaskStatus;
  updatedAt: string;
};

export type WarmStatus = {
  startedAt: string;
  updatedAt: string;
  current?: string | null;
  sessionsTotal: number;
  sessionsDiscovered: number;
  sessions: WarmSessionRow[];
  recentFailures: string[];
  recentLogs: string[];
};

