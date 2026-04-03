const CACHE_WARMER_BASE_URL =
  import.meta.env.RSBUILD_CACHE_WARMER_URL ??
  "https://openf1-cache-warmer.wrick17worker.workers.dev";

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
};

export const REMOTE_CACHE_OPS_ENABLED = parseBooleanEnv(
  import.meta.env.RSBUILD_ENABLE_REMOTE_CACHE_OPS,
  true,
);

export const REMOTE_CACHE_PROBES_ENABLED = parseBooleanEnv(
  import.meta.env.RSBUILD_ENABLE_REMOTE_CACHE_PROBES,
  true,
);

export type CacheStatus = "pending" | "missing" | "hit" | "warmed" | "failed";

export type DashboardSessionRow = {
  session_key: number;
  meeting_key: number;
  year: number;
  round: number;
  session_type: string;
  session_name: string | null;
  meeting_name: string | null;
  date_end: string;
  replay_status: CacheStatus;
  telemetry_status: CacheStatus;
  attempt_count: number;
  warm_in_progress: number;
  warm_started_at: string | null;
  last_attempt_at: string | null;
  next_retry_at: string;
  last_error: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type WarmAllBatchState = {
  id: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  total: number;
  done: number;
  active: number;
  failed: number;
  session_keys: number[];
  last_error: string | null;
};

type DashboardSessionsResponse = {
  rows: DashboardSessionRow[];
  batch: WarmAllBatchState | null;
};

type DashboardProbeResponse = {
  rows: DashboardSessionRow[];
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${CACHE_WARMER_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const loginDashboardWithShooToken = async (idToken: string) => {
  await request<{ ok: true }>("/auth/shoo/login", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  });
};

export const logoutDashboard = async () => {
  await request<{ ok: true }>("/auth/logout", {
    method: "POST",
  });
};

export const getDashboardSession = async () => {
  return request<{ authenticated: boolean }>("/auth/session");
};

export const getDashboardRows = async () => {
  return request<DashboardSessionsResponse>("/dashboard/sessions");
};

export const warmDashboardSession = async (sessionKey: number) => {
  return request<{ ok: true; row: DashboardSessionRow }>(`/dashboard/sessions/${sessionKey}/warm`, {
    method: "POST",
  });
};

export const warmAllMissingDashboardSessions = async () => {
  return request<{ ok: true; batch: WarmAllBatchState }>("/dashboard/warm-all", {
    method: "POST",
  });
};

export const probeDashboardRows = async (sessionKeys: number[]) => {
  return request<DashboardProbeResponse>("/dashboard/probe", {
    method: "POST",
    body: JSON.stringify({ session_keys: sessionKeys }),
  });
};
