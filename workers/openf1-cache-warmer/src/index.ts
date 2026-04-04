import { buildCarTelemetryPayload } from "../../../src/modules/replay/warm/buildCarTelemetryPayload";
import { buildReplayPayload } from "../../../src/modules/replay/warm/buildReplayPayload";
import type { CarTelemetryPayload } from "../../../src/modules/replay/types/carTelemetry.types";
import type { OpenF1Meeting, OpenF1Session, ReplaySessionData } from "../../../src/modules/replay/types/openf1.types";
import { ApiError, FatalAuthError } from "../../../scripts/warm-caches/errors";
import { buildMeetingIndex, fetchAllMeetings, filterEndedMeetings, findSessionByType } from "../../../scripts/warm-caches/meetings";
import { createOpenF1Client } from "../../../scripts/warm-caches/openf1";
import { retry } from "../../../scripts/warm-caches/retry";
import { createCarTelemetryWorkerClient, createReplayWorkerClient } from "../../../scripts/warm-caches/workers";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { buildShooAudience, isAllowedEmailClaim, parseEmailAllowlist } from "./auth";
import { isAllowedOrigin, parseAllowedOrigins } from "./cors";
import {
  OPENF1_NO_DATA_ERROR_PREFIX,
  OPENF1_NO_DATA_RETRY_INTERVAL_MS,
  getNextRetryAt,
  getRetryWindowMsForRow,
  isEligibleRow,
  isRetryableStatus,
  isSupportedSessionType,
  type CacheState,
  type SupportedSessionType,
  type WarmAttemptRow,
} from "./core";

type Env = {
  DB: D1Database;
  OPENF1_BASE_URL?: string;
  REPLAY_WORKER_BASE_URL?: string;
  CAR_TELEMETRY_WORKER_BASE_URL?: string;
  SHOO_BASE_URL?: string;
  DASHBOARD_ALLOWED_ORIGINS?: string;
  ADMIN_TOKEN?: string;
  OPS_ALLOWED_EMAILS?: string;
  SESSION_SECRET?: string;
};

type SessionCandidate = {
  meeting: OpenF1Meeting;
  session: OpenF1Session;
  round: number;
  sessionType: SupportedSessionType;
};

type RunResult = {
  reason: string;
  deepScan: boolean;
  startedAt: string;
  finishedAt: string;
  scanned: number;
  attempted: number;
  warmed: number;
  completed: number;
  failed: number;
  logs: string[];
};

type WarmAllBatchState = {
  id: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  heartbeat_at: string;
  finished_at: string | null;
  total: number;
  done: number;
  cursor: number;
  active: number;
  failed: number;
  session_keys: number[];
  last_error: string | null;
};

type AttemptUpdate = {
  replay_status: CacheState;
  telemetry_status: CacheState;
  attempt_count: number;
  warm_in_progress: number;
  warm_started_at: string | null;
  last_attempt_at: string | null;
  next_retry_at: string;
  last_error: string | null;
  completed_at: string | null;
};

type ApiClientDeps = {
  openf1: {
    fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>;
    fetchChunked: <T extends { date?: string }>(
      path: string,
      params: Record<string, string | number>,
      startMs: number,
      endMs: number,
      windowMs: number,
      onChunk: (chunk: T[], chunkEndMs: number) => void,
    ) => Promise<number>;
  };
  replayWorker: {
    fetchReplay: (
      sessionKey: number,
    ) => Promise<{ status: "hit"; payload: ReplaySessionData } | { status: "miss"; uploadToken: string; expiresAt: string }>;
    uploadReplay: (sessionKey: number, payload: ReplaySessionData, uploadToken: string) => Promise<void>;
    probeReplay: (sessionKey: number) => Promise<{ status: "hit" | "miss" }>;
  };
  carWorker: {
    fetchCar: (
      sessionKey: number,
    ) => Promise<{ status: "hit"; payload: CarTelemetryPayload } | { status: "miss"; uploadToken: string; expiresAt: string }>;
    uploadCar: (sessionKey: number, payload: CarTelemetryPayload, uploadToken: string) => Promise<void>;
    probeCar: (sessionKey: number) => Promise<{ status: "hit" | "miss" }>;
  };
};

const LOCATION_WINDOW_MS = 180000;
const POSITION_WINDOW_MS = 600000;
const POSITION_OFFSET_MS = 3600000;
const CAR_DATA_WINDOW_MS = 600000;

const MAX_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 60000;
const STATUS_LIMIT = 250;
const PROBE_SESSION_LIMIT = 20;
const DEEP_SCAN_CURSOR_KEY = "deep_scan_year_cursor";
const WARM_ALL_BATCH_STATE_KEY = "warm_all_batch_state";
const WARM_ALL_STALE_MS = 2 * 60 * 1000;
const WARM_ALL_STEP_TIMEOUT_MS = 30 * 1000;
const WARM_ALL_MAX_ATTEMPTS_PER_SESSION = 3;
const WARM_ROW_STALE_MS = 2 * 60 * 1000;

const DASHBOARD_SESSION_COOKIE = "ops_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_SHOO_BASE_URL = "https://shoo.dev";

class RetryableDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableDataError";
  }
}

const assertRuntimeEnv = (env: Env) => {
  const openf1BaseUrl = env.OPENF1_BASE_URL ?? "https://api.openf1.org/v1";
  const replayWorkerBaseUrl =
    env.REPLAY_WORKER_BASE_URL ?? "https://openf1-proxy.wrick17worker.workers.dev";
  const carWorkerBaseUrl =
    env.CAR_TELEMETRY_WORKER_BASE_URL ?? "https://openf1-car-telemetry.wrick17worker.workers.dev";
  return {
    openf1BaseUrl,
    replayWorkerBaseUrl,
    carWorkerBaseUrl,
  };
};

const requireAdminToken = (env: Env) => {
  if (!env.ADMIN_TOKEN) {
    throw new Error("Missing ADMIN_TOKEN binding");
  }
  return env.ADMIN_TOKEN;
};

const requireAllowedEmails = (env: Env) => {
  const allowlist = parseEmailAllowlist(env.OPS_ALLOWED_EMAILS);
  if (!allowlist.size) {
    throw new Error("Missing OPS_ALLOWED_EMAILS binding");
  }
  return allowlist;
};

const requireSessionSecret = (env: Env) => {
  if (!env.SESSION_SECRET) {
    throw new Error("Missing SESSION_SECRET binding");
  }
  return env.SESSION_SECRET;
};

const getShooBaseUrl = (env: Env) => {
  const baseUrl = env.SHOO_BASE_URL ?? DEFAULT_SHOO_BASE_URL;
  return baseUrl.replace(/\/+$/, "");
};

const withCors = (
  request: Request,
  headers: Headers,
  options: {
    allowCredentials?: boolean;
    allowlist?: string[];
  } = {},
) => {
  const origin = request.headers.get("origin");
  if (options.allowCredentials) {
    const allowlist = options.allowlist ?? [];
    if (origin && isAllowedOrigin(origin, allowlist)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Vary", "Origin");
    }
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
};

const jsonResponse = (
  request: Request,
  body: unknown,
  status = 200,
  options: {
    allowCredentials?: boolean;
    allowlist?: string[];
    extraHeaders?: Record<string, string>;
  } = {},
) => {
  const headers = withCors(
    request,
    new Headers({
      "Content-Type": "application/json; charset=utf-8",
    }),
    {
      allowCredentials: options.allowCredentials,
      allowlist: options.allowlist,
    },
  );
  Object.entries(options.extraHeaders ?? {}).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
};

const base64UrlEncode = (input: ArrayBuffer | Uint8Array) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(`${padded}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

let sessionSigningKeyPromise: Promise<CryptoKey> | null = null;
const getSessionSigningKey = (secret: string) => {
  if (!sessionSigningKeyPromise) {
    const encoder = new TextEncoder();
    sessionSigningKeyPromise = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return sessionSigningKeyPromise;
};

type SessionTokenPayload = {
  exp: number;
};

const signSessionToken = async (payload: SessionTokenPayload, secret: string) => {
  const encoder = new TextEncoder();
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await getSessionSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(signature)}`;
};

const verifySessionToken = async (token: string, secret: string): Promise<boolean> => {
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return false;
  const key = await getSessionSigningKey(secret);
  const encoder = new TextEncoder();
  const expected = base64UrlEncode(await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64)));
  if (expected !== signatureB64) return false;
  const payloadBytes = base64UrlDecode(payloadB64);
  const payloadJson = new TextDecoder().decode(payloadBytes);
  const payload = JSON.parse(payloadJson) as SessionTokenPayload;
  if (typeof payload.exp !== "number") return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp >= now;
};

const parseCookie = (request: Request, key: string) => {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const item = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));
  if (!item) return null;
  return item.slice(`${key}=`.length);
};

const createSessionCookie = (token: string) => {
  return `${DASHBOARD_SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
};

const clearSessionCookie = () =>
  `${DASHBOARD_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;

const isAuthorized = (request: Request, token: string) => {
  const authHeader = request.headers.get("authorization") ?? "";
  const value = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return value.length > 0 && value === token;
};

let shooJwksPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null;
let shooJwksBaseUrl: string | null = null;

const getShooJwks = async (shooBaseUrl: string) => {
  if (!shooJwksPromise || shooJwksBaseUrl !== shooBaseUrl) {
    shooJwksBaseUrl = shooBaseUrl;
    shooJwksPromise = (async () => {
      const discoveryResponse = await fetch(`${shooBaseUrl}/.well-known/openid-configuration`);
      if (!discoveryResponse.ok) {
        throw new Error(`Failed to fetch Shoo discovery document: ${discoveryResponse.status}`);
      }
      const discovery = (await discoveryResponse.json()) as { jwks_uri?: string };
      if (!discovery.jwks_uri) {
        throw new Error("Shoo discovery document missing jwks_uri");
      }
      return createRemoteJWKSet(new URL(discovery.jwks_uri));
    })();
  }
  return shooJwksPromise;
};

const verifyShooIdToken = async (idToken: string, shooBaseUrl: string, expectedAudience: string) => {
  const jwks = await getShooJwks(shooBaseUrl);
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: shooBaseUrl,
    audience: expectedAudience,
    algorithms: ["ES256"],
  });
  return payload;
};

const fetchAttemptRow = async (db: D1Database, sessionKey: number) => {
  const row = await db
    .prepare("SELECT * FROM warm_session_attempts WHERE session_key = ?")
    .bind(sessionKey)
    .first<WarmAttemptRow>();
  return row ? normalizeWarmRow(row) : null;
};

const normalizeCacheState = (state: string | null | undefined): CacheState => {
  if (state === "missing" || state === "expired") return "missing";
  if (state === "pending" || state === "hit" || state === "warmed" || state === "failed") {
    return state;
  }
  return "pending";
};

const normalizeWarmRow = (row: WarmAttemptRow): WarmAttemptRow => {
  return {
    ...row,
    replay_status: normalizeCacheState(row.replay_status),
    telemetry_status: normalizeCacheState(row.telemetry_status),
    warm_in_progress: row.warm_in_progress ? 1 : 0,
    warm_started_at: row.warm_started_at ?? null,
  };
};

const upsertAttemptSeed = async (db: D1Database, candidate: SessionCandidate, nowIso: string) => {
  await db
    .prepare(
      `INSERT INTO warm_session_attempts
      (session_key, meeting_key, meeting_name, year, round, session_type, session_name, date_end, replay_status, telemetry_status, attempt_count, warm_in_progress, warm_started_at, last_attempt_at, next_retry_at, last_error, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 0, 0, NULL, NULL, ?, NULL, NULL, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        meeting_key = excluded.meeting_key,
        meeting_name = COALESCE(excluded.meeting_name, warm_session_attempts.meeting_name),
        year = excluded.year,
        round = excluded.round,
        session_type = excluded.session_type,
        session_name = COALESCE(excluded.session_name, warm_session_attempts.session_name),
        date_end = excluded.date_end,
        updated_at = excluded.updated_at`,
    )
    .bind(
      candidate.session.session_key,
      candidate.meeting.meeting_key,
      candidate.meeting.meeting_name ?? null,
      candidate.session.year,
      candidate.round,
      candidate.sessionType,
      candidate.session.session_name ?? null,
      candidate.session.date_end,
      nowIso,
      nowIso,
      nowIso,
    )
    .run();
};

const persistAttempt = async (db: D1Database, sessionKey: number, patch: AttemptUpdate, nowIso: string) => {
  await db
    .prepare(
      `UPDATE warm_session_attempts
      SET replay_status = ?, telemetry_status = ?, attempt_count = ?, warm_in_progress = ?, warm_started_at = ?, last_attempt_at = ?, next_retry_at = ?, last_error = ?, completed_at = ?, updated_at = ?
      WHERE session_key = ?`,
    )
    .bind(
      patch.replay_status,
      patch.telemetry_status,
      patch.attempt_count,
      patch.warm_in_progress,
      patch.warm_started_at,
      patch.last_attempt_at,
      patch.next_retry_at,
      patch.last_error,
      patch.completed_at,
      nowIso,
      sessionKey,
    )
    .run();
};

const fetchDueAttemptRows = async (db: D1Database, nowIso: string) => {
  const { results } = await db
    .prepare(
      `SELECT * FROM warm_session_attempts
      WHERE completed_at IS NULL
        AND next_retry_at <= ?
      ORDER BY next_retry_at ASC
      LIMIT ?`,
    )
    .bind(nowIso, STATUS_LIMIT)
    .all<WarmAttemptRow>();
  return (results ?? []).map(normalizeWarmRow);
};

const fetchStatusRows = async (db: D1Database) => {
  const { results } = await db
    .prepare("SELECT * FROM warm_session_attempts ORDER BY updated_at DESC LIMIT ?")
    .bind(STATUS_LIMIT)
    .all<WarmAttemptRow>();
  return (results ?? []).map(normalizeWarmRow);
};

const fetchAllAttemptRows = async (db: D1Database) => {
  const { results } = await db.prepare("SELECT * FROM warm_session_attempts ORDER BY updated_at DESC").all<WarmAttemptRow>();
  return (results ?? []).map(normalizeWarmRow);
};

const readWorkerState = async (db: D1Database, key: string) => {
  const row = await db
    .prepare("SELECT state_value FROM warm_worker_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string }>();
  return row?.state_value ?? null;
};

const writeWorkerState = async (db: D1Database, key: string, value: string, nowIso: string) => {
  await db
    .prepare(
      `INSERT INTO warm_worker_state (state_key, state_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, nowIso)
    .run();
};

const readWarmAllBatchState = async (db: D1Database) => {
  const raw = await readWorkerState(db, WARM_ALL_BATCH_STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WarmAllBatchState>;
    if (!parsed || typeof parsed !== "object" || !parsed.id || !parsed.status) {
      return null;
    }
    const total =
      typeof parsed.total === "number"
        ? parsed.total
        : Array.isArray(parsed.session_keys)
          ? parsed.session_keys.length
          : 0;
    const done = typeof parsed.done === "number" ? parsed.done : 0;
    const cursorRaw = typeof parsed.cursor === "number" ? parsed.cursor : done;
    const cursor = Math.max(0, Math.min(total, cursorRaw));
    return {
      id: parsed.id,
      status: parsed.status,
      started_at: parsed.started_at ?? new Date().toISOString(),
      heartbeat_at: parsed.heartbeat_at ?? parsed.started_at ?? new Date().toISOString(),
      finished_at: parsed.finished_at ?? null,
      total,
      done,
      cursor,
      active: parsed.active ?? 0,
      failed: parsed.failed ?? 0,
      session_keys: Array.isArray(parsed.session_keys) ? parsed.session_keys : [],
      last_error: parsed.last_error ?? null,
    } satisfies WarmAllBatchState;
  } catch {
    return null;
  }
};

const writeWarmAllBatchState = async (db: D1Database, state: WarmAllBatchState) => {
  const nowIso = new Date().toISOString();
  await writeWorkerState(db, WARM_ALL_BATCH_STATE_KEY, JSON.stringify(state), nowIso);
};

const clearStaleWarmRows = async (db: D1Database, nowMs: number) => {
  const thresholdIso = new Date(nowMs - WARM_ROW_STALE_MS).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  await db
    .prepare(
      `UPDATE warm_session_attempts
       SET warm_in_progress = 0,
           warm_started_at = NULL,
           updated_at = ?
       WHERE warm_in_progress = 1
         AND (warm_started_at IS NULL OR warm_started_at <= ?)`,
    )
    .bind(nowIso, thresholdIso)
    .run();
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const classifyRetryable = (error: unknown) => {
  if (error instanceof RetryableDataError) return true;
  if (error instanceof ApiError) return isRetryableStatus(error.status);
  return false;
};

const classifyFatalAuth = (error: unknown) => {
  if (error instanceof FatalAuthError) return true;
  if (error instanceof ApiError) return error.status === 401;
  return false;
};

const isReplayComplete = (status: CacheState) => status === "hit" || status === "warmed";
const isTelemetryComplete = (status: CacheState) => status === "hit" || status === "warmed";

const validateReplayPayload = (payload: ReplaySessionData) => {
  if (payload.drivers.length === 0) {
    throw new RetryableDataError("Replay payload has no drivers yet");
  }
  const hasTelemetry = Object.values(payload.telemetryByDriver).some(
    (entry) => entry.locations.length > 0 || entry.positions.length > 0,
  );
  if (!hasTelemetry) {
    throw new RetryableDataError("Replay payload has no location/position telemetry yet");
  }
};

const validateCarTelemetryPayload = (payload: CarTelemetryPayload) => {
  const sampleCount = Object.values(payload.byDriver).reduce((count, samples) => count + samples.length, 0);
  if (sampleCount === 0) {
    throw new RetryableDataError("Car telemetry payload has no samples yet");
  }
};

type WarmFailureAnalysis = {
  retryable: boolean;
  nextRetryAt: string;
  lastError: string;
  completeNow: boolean;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const analyzeWarmFailure = (
  error: unknown,
  nowMs: number,
  runtimeUrls: { openf1BaseUrl: string; replayWorkerBaseUrl: string; carWorkerBaseUrl: string },
): WarmFailureAnalysis => {
  const defaultMessage = error instanceof Error ? error.message : String(error);
  const defaultRetryable = classifyRetryable(error);
  const fallback: WarmFailureAnalysis = {
    retryable: defaultRetryable,
    nextRetryAt: getNextRetryAt(nowMs),
    lastError: defaultMessage,
    completeNow: !defaultRetryable,
  };

  if (error instanceof RetryableDataError) {
    return {
      retryable: true,
      nextRetryAt: getNextRetryAt(nowMs, OPENF1_NO_DATA_RETRY_INTERVAL_MS),
      lastError: `${OPENF1_NO_DATA_ERROR_PREFIX} ${error.message}`,
      completeNow: false,
    };
  }

  if (!(error instanceof ApiError)) {
    return fallback;
  }

  const url = trimTrailingSlash(error.url);
  const openf1Base = trimTrailingSlash(runtimeUrls.openf1BaseUrl);
  const replayBase = trimTrailingSlash(runtimeUrls.replayWorkerBaseUrl);
  const carBase = trimTrailingSlash(runtimeUrls.carWorkerBaseUrl);

  if (url.startsWith(openf1Base)) {
    if (error.status === 404) {
      return {
        retryable: true,
        nextRetryAt: getNextRetryAt(nowMs, OPENF1_NO_DATA_RETRY_INTERVAL_MS),
        lastError: `${OPENF1_NO_DATA_ERROR_PREFIX} OpenF1 returned 404 (${error.url})`,
        completeNow: false,
      };
    }
    if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
      return {
        retryable: true,
        nextRetryAt: getNextRetryAt(nowMs),
        lastError: `OPENF1_TRANSIENT: ${error.message}`,
        completeNow: false,
      };
    }
  }

  if (url.startsWith(replayBase) || url.startsWith(carBase)) {
    if (error.status === 404) {
      return {
        retryable: false,
        nextRetryAt: getNextRetryAt(nowMs),
        lastError: `WORKER_ROUTE_404: ${error.message}`,
        completeNow: true,
      };
    }
    if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
      return {
        retryable: true,
        nextRetryAt: getNextRetryAt(nowMs),
        lastError: `WORKER_TRANSIENT: ${error.message}`,
        completeNow: false,
      };
    }
  }

  return fallback;
};

const createApiClients = (env: Env, appendLog: (line: string) => void): ApiClientDeps => {
  const { openf1BaseUrl, replayWorkerBaseUrl, carWorkerBaseUrl } = assertRuntimeEnv(env);
  const openf1Raw = createOpenF1Client(openf1BaseUrl, appendLog);
  const replayWorkerRaw = createReplayWorkerClient(replayWorkerBaseUrl, appendLog);
  const carWorkerRaw = createCarTelemetryWorkerClient(carWorkerBaseUrl, appendLog);

  const withRetry = <T>(label: string, fn: () => Promise<T>) =>
    retry(fn, {
      label,
      maxAttempts: MAX_ATTEMPTS,
      baseDelayMs: RETRY_BASE_DELAY_MS,
      maxDelayMs: RETRY_MAX_DELAY_MS,
      appendLog,
    });

  return {
    openf1: {
      fetchOpenF1: <T>(path: string, params: Record<string, string | number>) =>
        withRetry(`OpenF1 ${path}`, () => openf1Raw.fetchOpenF1<T>(path, params)),
      fetchChunked: openf1Raw.fetchChunked,
    },
    replayWorker: {
      fetchReplay: (sessionKey: number) =>
        withRetry(`Replay GET ${sessionKey}`, () => replayWorkerRaw.fetchReplayFromWorker(sessionKey)),
      uploadReplay: (sessionKey: number, payload: ReplaySessionData, uploadToken: string) =>
        withRetry(`Replay POST ${sessionKey}`, () =>
          replayWorkerRaw.uploadReplayToWorker(sessionKey, payload, uploadToken),
        ),
      probeReplay: (sessionKey: number) => replayWorkerRaw.probeReplayFromWorker(sessionKey),
    },
    carWorker: {
      fetchCar: (sessionKey: number) =>
        withRetry(`Car GET ${sessionKey}`, () => carWorkerRaw.fetchCarTelemetryFromWorker(sessionKey)),
      uploadCar: (sessionKey: number, payload: CarTelemetryPayload, uploadToken: string) =>
        withRetry(`Car POST ${sessionKey}`, () =>
          carWorkerRaw.uploadCarTelemetryToWorker(sessionKey, payload, uploadToken),
        ),
      probeCar: (sessionKey: number) => carWorkerRaw.probeCarTelemetryFromWorker(sessionKey),
    },
  };
};

const discoverCandidates = async (
  fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>,
  nowMs: number,
  appendLog: (line: string) => void,
  options: { years?: number[] } = {},
) => {
  const candidates = new Map<number, SessionCandidate>();
  const targetYears = options.years?.length ? [...new Set(options.years)] : [new Date(nowMs).getUTCFullYear()];
  const meetings: OpenF1Meeting[] = [];
  for (const year of targetYears) {
    const yearMeetings = await fetchOpenF1<OpenF1Meeting[]>("meetings", { year });
    meetings.push(...yearMeetings);
  }
  const endedMeetings = filterEndedMeetings(meetings, nowMs);
  const { byYear, years } = buildMeetingIndex(endedMeetings);

  for (const year of years) {
    const yearMeetings = byYear.get(year) ?? [];
    for (let idx = 0; idx < yearMeetings.length; idx += 1) {
      const meeting = yearMeetings[idx];
      const round = idx + 1;
      const sessions = await fetchOpenF1<OpenF1Session[]>("sessions", { meeting_key: meeting.meeting_key });
      const endedSessions = sessions.filter(
        (session) => Number.isFinite(Date.parse(session.date_end)) && Date.parse(session.date_end) <= nowMs,
      );

      for (const sessionType of ["Race", "Sprint", "Qualifying"] as const) {
        const match = findSessionByType(endedSessions, sessionType);
        if (!match) continue;
        candidates.set(match.session_key, {
          meeting,
          session: match,
          round,
          sessionType,
        });
      }
    }
  }

  appendLog(`[Discover] years=${targetYears.join(",")} candidates=${candidates.size}`);
  return candidates;
};

const selectDeepScanYear = async (
  db: D1Database,
  fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>,
  nowMs: number,
) => {
  const meetings = await fetchAllMeetings(fetchOpenF1);
  const endedMeetings = filterEndedMeetings(meetings, nowMs);
  const years = [...new Set(endedMeetings.map((meeting) => meeting.year))].sort((a, b) => a - b);
  if (!years.length) return null;

  const lastYearRaw = await readWorkerState(db, DEEP_SCAN_CURSOR_KEY);
  const lastYear = Number(lastYearRaw);
  if (!Number.isFinite(lastYear)) {
    return years[0];
  }
  const index = years.findIndex((year) => year === lastYear);
  if (index < 0 || index === years.length - 1) {
    return years[0];
  }
  return years[index + 1];
};

const getRoundForMeeting = async (
  fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>,
  meeting: OpenF1Meeting,
) => {
  const meetings = await fetchOpenF1<OpenF1Meeting[]>("meetings", { year: meeting.year });
  const endedSorted = filterEndedMeetings(meetings, Date.now()).sort(
    (a, b) => Date.parse(a.date_start) - Date.parse(b.date_start),
  );
  const index = endedSorted.findIndex((item) => item.meeting_key === meeting.meeting_key);
  return index >= 0 ? index + 1 : 1;
};

const warmCandidate = async (
  env: Env,
  clients: ApiClientDeps,
  candidate: SessionCandidate,
  nowMs: number,
  nowIso: string,
  options: { force: boolean },
) => {
  const sessionKey = candidate.session.session_key;
  await upsertAttemptSeed(env.DB, candidate, nowIso);
  const row = await fetchAttemptRow(env.DB, sessionKey);
  if (!row) {
    throw new Error(`Unable to load warm row for session_key=${sessionKey}`);
  }

  if (!options.force && !isEligibleRow(row, nowMs)) {
    const retryWindowMs = getRetryWindowMsForRow(row);
    if (!row.completed_at && Number.isFinite(Date.parse(row.date_end)) && Date.parse(row.date_end) + retryWindowMs < nowMs) {
      await persistAttempt(
        env.DB,
        sessionKey,
        {
          replay_status: row.replay_status === "pending" ? "missing" : row.replay_status,
          telemetry_status: row.telemetry_status === "pending" ? "missing" : row.telemetry_status,
          attempt_count: row.attempt_count,
          warm_in_progress: 0,
          warm_started_at: null,
          last_attempt_at: row.last_attempt_at,
          next_retry_at: row.next_retry_at,
          last_error: row.last_error,
          completed_at: nowIso,
        },
        nowIso,
      );
    }
    return { attempted: false, warmed: 0, completed: 0, failed: 0 };
  }

  const patch: AttemptUpdate = {
    replay_status: row.replay_status,
    telemetry_status: row.telemetry_status,
    attempt_count: row.attempt_count + 1,
    warm_in_progress: 1,
    warm_started_at: nowIso,
    last_attempt_at: nowIso,
    next_retry_at: getNextRetryAt(nowMs),
    last_error: null,
    completed_at: null,
  };

  let warmedCount = 0;
  let failedCount = 0;
  let completedCount = 0;

  await persistAttempt(env.DB, sessionKey, patch, nowIso);

  try {
    const replayState = await clients.replayWorker.fetchReplay(sessionKey);
    const carState = await clients.carWorker.fetchCar(sessionKey);

    patch.replay_status = replayState.status === "hit" ? "hit" : "pending";
    patch.telemetry_status = carState.status === "hit" ? "hit" : "pending";

    if (replayState.status !== "hit") {
      const replayPayload = await buildReplayPayload(
        candidate.meeting,
        candidate.session,
        {
          appendLog: () => undefined,
          fetchOpenF1: clients.openf1.fetchOpenF1,
          fetchChunked: clients.openf1.fetchChunked,
        },
        {
          locationWindowMs: LOCATION_WINDOW_MS,
          positionWindowMs: POSITION_WINDOW_MS,
          positionOffsetMs: POSITION_OFFSET_MS,
        },
      );
      validateReplayPayload(replayPayload);
      await clients.replayWorker.uploadReplay(sessionKey, replayPayload, replayState.uploadToken);
      patch.replay_status = "warmed";
      warmedCount += 1;
      await clients.replayWorker.fetchReplay(sessionKey);
    }

    if (carState.status !== "hit") {
      const telemetryPayload = await buildCarTelemetryPayload(
        candidate.session,
        {
          appendLog: () => undefined,
          fetchChunked: clients.openf1.fetchChunked,
        },
        {
          carDataWindowMs: CAR_DATA_WINDOW_MS,
        },
      );
      validateCarTelemetryPayload(telemetryPayload);
      await clients.carWorker.uploadCar(sessionKey, telemetryPayload, carState.uploadToken);
      patch.telemetry_status = "warmed";
      warmedCount += 1;
      await clients.carWorker.fetchCar(sessionKey);
    }

    if (isReplayComplete(patch.replay_status) && isTelemetryComplete(patch.telemetry_status)) {
      patch.completed_at = nowIso;
      completedCount = 1;
    }
  } catch (error) {
    if (classifyFatalAuth(error)) {
      patch.last_error = error instanceof Error ? error.message : String(error);
      patch.replay_status = patch.replay_status === "pending" ? "failed" : patch.replay_status;
      patch.telemetry_status = patch.telemetry_status === "pending" ? "failed" : patch.telemetry_status;
      patch.completed_at = nowIso;
      patch.warm_in_progress = 0;
      patch.warm_started_at = null;
      await persistAttempt(env.DB, sessionKey, patch, nowIso);
      throw error;
    }
    const failure = analyzeWarmFailure(error, nowMs, assertRuntimeEnv(env));
    patch.last_error = failure.lastError;
    patch.next_retry_at = failure.nextRetryAt;
    patch.replay_status = patch.replay_status === "pending" ? "failed" : patch.replay_status;
    patch.telemetry_status = patch.telemetry_status === "pending" ? "failed" : patch.telemetry_status;
    if (failure.completeNow) {
      patch.completed_at = nowIso;
    }
    failedCount = 1;
  }

  patch.warm_in_progress = 0;
  patch.warm_started_at = null;
  await persistAttempt(env.DB, sessionKey, patch, nowIso);
  return {
    attempted: true,
    warmed: warmedCount,
    completed: completedCount,
    failed: failedCount,
  };
};

const runPass = async (env: Env, reason: string, deepScan: boolean): Promise<RunResult> => {
  const logs: string[] = [];
  const appendLog = (line: string) => {
    logs.push(`${new Date().toISOString()} ${line}`);
  };
  const clients = createApiClients(env, appendLog);

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let scanned = 0;
  let attempted = 0;
  let warmed = 0;
  let completed = 0;
  let failed = 0;
  let deepScanYear: number | null = null;

  if (deepScan) {
    deepScanYear = await selectDeepScanYear(env.DB, clients.openf1.fetchOpenF1, nowMs);
  }

  const candidates = await discoverCandidates(clients.openf1.fetchOpenF1, nowMs, appendLog, {
    years: deepScanYear ? [deepScanYear] : undefined,
  });
  const dueRows = await fetchDueAttemptRows(env.DB, nowIso);
  appendLog(`[Retry] dueRows=${dueRows.length} deepScanYear=${deepScanYear ?? "n/a"}`);

  for (const row of dueRows) {
    if (candidates.has(row.session_key)) continue;
    const sessions = await clients.openf1.fetchOpenF1<OpenF1Session[]>("sessions", { session_key: row.session_key });
    const meetings = await clients.openf1.fetchOpenF1<OpenF1Meeting[]>("meetings", { meeting_key: row.meeting_key });
    const session = sessions[0];
    const meeting = meetings[0];
    if (!session || !meeting || !isSupportedSessionType(row.session_type)) continue;
    candidates.set(row.session_key, {
      meeting,
      session,
      round: row.round,
      sessionType: row.session_type,
    });
  }

  for (const candidate of candidates.values()) {
    scanned += 1;
    const result = await warmCandidate(env, clients, candidate, nowMs, nowIso, { force: false });
    if (result.attempted) {
      attempted += 1;
      warmed += result.warmed;
      completed += result.completed;
      failed += result.failed;
    }
  }

  const finishedAt = new Date().toISOString();
  appendLog(
    `[Done] reason=${reason} deepScan=${deepScan} scanned=${scanned} attempted=${attempted} warmed=${warmed} completed=${completed} failed=${failed}`,
  );
  if (deepScan && deepScanYear) {
    await writeWorkerState(env.DB, DEEP_SCAN_CURSOR_KEY, String(deepScanYear), nowIso);
  }
  return {
    reason,
    deepScan,
    startedAt: nowIso,
    finishedAt,
    scanned,
    attempted,
    warmed,
    completed,
    failed,
    logs,
  };
};

const getDashboardRows = async (env: Env, search: string) => {
  const rows = await fetchAllAttemptRows(env.DB);
  const query = search.trim().toLowerCase();
  if (!query) {
    return rows;
  }
  return rows.filter((row) => {
    const haystack = [
      row.year,
      row.round,
      row.meeting_name ?? "",
      row.session_name ?? "",
      row.session_type,
      row.session_key,
      row.replay_status,
      row.telemetry_status,
      row.last_error ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
};

const hasMissingCache = (row: WarmAttemptRow) =>
  !isReplayComplete(row.replay_status) || !isTelemetryComplete(row.telemetry_status);

const isWarmAllBatchStale = (state: WarmAllBatchState, nowMs: number) => {
  if (state.status !== "running" || state.active < 1) return false;
  const heartbeatMs = Date.parse(state.heartbeat_at || state.started_at);
  if (!Number.isFinite(heartbeatMs)) return true;
  return nowMs - heartbeatMs > WARM_ALL_STALE_MS;
};

const finalizeWarmAllBatchIfDone = (state: WarmAllBatchState): WarmAllBatchState => {
  if (state.cursor < state.total) return state;
  return {
    ...state,
    status: state.failed > 0 ? "failed" : "completed",
    finished_at: state.finished_at ?? new Date().toISOString(),
    active: 0,
    heartbeat_at: new Date().toISOString(),
  };
};

const recoverStaleWarmAllBatch = async (env: Env) => {
  await clearStaleWarmRows(env.DB, Date.now());
  const state = await readWarmAllBatchState(env.DB);
  if (!state || !isWarmAllBatchStale(state, Date.now())) return state;
  const recovered: WarmAllBatchState = {
    ...state,
    active: 0,
    heartbeat_at: new Date().toISOString(),
    last_error: state.last_error ?? "Recovered stale warm-all run; resumed.",
  };
  await writeWarmAllBatchState(env.DB, recovered);
  return recovered;
};

const processWarmAllBatchStep = async (env: Env, batchId: string) => {
  const state = await recoverStaleWarmAllBatch(env);
  if (!state || state.id !== batchId || state.status !== "running") return;
  if (state.active > 0) return;

  const finalized = finalizeWarmAllBatchIfDone(state);
  if (finalized.status !== "running") {
    await writeWarmAllBatchState(env.DB, finalized);
    return;
  }

  const sessionKey = finalized.session_keys[finalized.cursor];
  if (!Number.isFinite(sessionKey)) {
    await writeWarmAllBatchState(
      env.DB,
      finalizeWarmAllBatchIfDone({
        ...finalized,
        cursor: finalized.cursor + 1,
        done: Math.min(finalized.total, finalized.done + 1),
        heartbeat_at: new Date().toISOString(),
      }),
    );
    return;
  }

  const started: WarmAllBatchState = {
    ...finalized,
    active: 1,
    heartbeat_at: new Date().toISOString(),
  };
  await writeWarmAllBatchState(env.DB, started);

  const currentRow = await fetchAttemptRow(env.DB, sessionKey);
  if (currentRow && currentRow.attempt_count >= WARM_ALL_MAX_ATTEMPTS_PER_SESSION) {
    const nowIso = new Date().toISOString();
    await persistAttempt(
      env.DB,
      sessionKey,
      {
        replay_status: currentRow.replay_status,
        telemetry_status: currentRow.telemetry_status,
        attempt_count: currentRow.attempt_count,
        warm_in_progress: 0,
        warm_started_at: null,
        last_attempt_at: currentRow.last_attempt_at,
        next_retry_at: currentRow.next_retry_at,
        last_error: `Skipped in warm-all after ${currentRow.attempt_count} attempts`,
        completed_at: currentRow.completed_at,
      },
      nowIso,
    );
    const latest = await readWarmAllBatchState(env.DB);
    if (!latest || latest.id !== batchId) return;
    const skipped = finalizeWarmAllBatchIfDone({
      ...latest,
      done: Math.min(latest.total, latest.done + 1),
      cursor: Math.min(latest.total, latest.cursor + 1),
      active: 0,
      failed: latest.failed + 1,
      heartbeat_at: new Date().toISOString(),
      last_error: `Skipped session ${sessionKey} after ${currentRow.attempt_count} attempts`,
      finished_at:
        latest.cursor + 1 >= latest.total ? new Date().toISOString() : latest.finished_at,
    });
    await writeWarmAllBatchState(env.DB, skipped);
    return;
  }

  const clients = createApiClients(env, () => undefined);
  let failed = false;
  let errorMessage: string | null = null;
  try {
    await withTimeout(
      warmBySessionKeyWithClients(env, clients, sessionKey),
      WARM_ALL_STEP_TIMEOUT_MS,
      `Warm session ${sessionKey} timed out after ${Math.round(WARM_ALL_STEP_TIMEOUT_MS / 1000)}s`,
    );
  } catch (error) {
    failed = true;
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const latest = await readWarmAllBatchState(env.DB);
  if (!latest || latest.id !== batchId) return;

  const progressed = finalizeWarmAllBatchIfDone({
    ...latest,
    done: Math.min(latest.total, latest.done + 1),
    cursor: Math.min(latest.total, latest.cursor + 1),
    active: 0,
    failed: latest.failed + (failed ? 1 : 0),
    heartbeat_at: new Date().toISOString(),
    last_error: failed && errorMessage ? errorMessage : latest.last_error,
    finished_at:
      latest.cursor + 1 >= latest.total ? new Date().toISOString() : latest.finished_at,
  });
  await writeWarmAllBatchState(env.DB, progressed);
};

const startWarmAllBatch = async (env: Env, ctx: ExecutionContext) => {
  const running = await recoverStaleWarmAllBatch(env);
  if (running?.status === "running") {
    if (running.active === 0 && running.cursor < running.total) {
      ctx.waitUntil(processWarmAllBatchStep(env, running.id));
    }
    return running;
  }

  const rows = await fetchAllAttemptRows(env.DB);
  const sessionKeys = rows
    .filter((row) => hasMissingCache(row))
    .map((row) => row.session_key);

  const nowIso = new Date().toISOString();
  const state: WarmAllBatchState = {
    id: crypto.randomUUID(),
    status: "running",
    started_at: nowIso,
    heartbeat_at: nowIso,
    finished_at: null,
    total: sessionKeys.length,
    done: 0,
    cursor: 0,
    active: 0,
    failed: 0,
    session_keys: sessionKeys,
    last_error: null,
  };

  await writeWarmAllBatchState(env.DB, state);
  if (sessionKeys.length > 0) {
    ctx.waitUntil(processWarmAllBatchStep(env, state.id));
  } else {
    await writeWarmAllBatchState(env.DB, {
      ...state,
      status: "completed",
      finished_at: nowIso,
    });
  }
  return state;
};

const probeDashboardSessionKeys = async (env: Env, sessionKeys: number[]) => {
  const uniqueSessionKeys = [...new Set(sessionKeys.filter(Number.isFinite))];
  if (uniqueSessionKeys.length > PROBE_SESSION_LIMIT) {
    throw new Error(`Too many session keys. Maximum is ${PROBE_SESSION_LIMIT}.`);
  }
  const nowIso = new Date().toISOString();
  const clients = createApiClients(env, () => undefined);
  const rows: WarmAttemptRow[] = [];

  for (const sessionKey of uniqueSessionKeys) {
    const row = await fetchAttemptRow(env.DB, sessionKey);
    if (!row || row.warm_in_progress) continue;

    try {
      const [replayStatus, telemetryStatus] = await Promise.all([
        clients.replayWorker.probeReplay(sessionKey),
        clients.carWorker.probeCar(sessionKey),
      ]);

      const replayState = replayStatus.status === "hit" ? "hit" : "missing";
      const telemetryState = telemetryStatus.status === "hit" ? "hit" : "missing";
      const cacheReady = isReplayComplete(replayState) && isTelemetryComplete(telemetryState);
      const completedAt =
        cacheReady ? row.completed_at ?? nowIso : null;

      await persistAttempt(
        env.DB,
        sessionKey,
        {
          replay_status: replayState,
          telemetry_status: telemetryState,
          attempt_count: row.attempt_count,
          warm_in_progress: row.warm_in_progress,
          warm_started_at: row.warm_started_at,
          last_attempt_at: row.last_attempt_at,
          next_retry_at: row.next_retry_at,
          last_error: cacheReady ? null : row.last_error,
          completed_at: completedAt,
        },
        nowIso,
      );
      const updated = await fetchAttemptRow(env.DB, sessionKey);
      if (updated) rows.push(updated);
    } catch {
      rows.push(row);
    }
  }

  return rows;
};

const warmBySessionKeyWithClients = async (env: Env, clients: ApiClientDeps, sessionKey: number) => {
  const sessions = await clients.openf1.fetchOpenF1<OpenF1Session[]>("sessions", { session_key: sessionKey });
  const session = sessions[0];
  if (!session) {
    throw new Error(`Session not found: ${sessionKey}`);
  }
  if (!isSupportedSessionType(session.session_type)) {
    throw new Error(`Unsupported session type: ${session.session_type}`);
  }
  const endMs = Date.parse(session.date_end);
  if (!Number.isFinite(endMs) || endMs > Date.now()) {
    throw new Error("Session has not ended yet");
  }

  const meetings = await clients.openf1.fetchOpenF1<OpenF1Meeting[]>("meetings", { meeting_key: session.meeting_key });
  const meeting = meetings[0];
  if (!meeting) {
    throw new Error(`Meeting not found for session_key=${sessionKey}`);
  }

  const round = await getRoundForMeeting(clients.openf1.fetchOpenF1, meeting);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  await warmCandidate(
    env,
    clients,
    {
      meeting,
      session,
      round,
      sessionType: session.session_type,
    },
    nowMs,
    nowIso,
    { force: true },
  );

  const row = await fetchAttemptRow(env.DB, sessionKey);
  if (!row) {
    throw new Error("Warm row not found after warm action");
  }
  return row;
};

const warmBySessionKey = async (env: Env, sessionKey: number) => {
  const clients = createApiClients(env, () => undefined);
  return warmBySessionKeyWithClients(env, clients, sessionKey);
};

const isDashboardPath = (pathname: string) =>
  pathname.startsWith("/auth/") || pathname.startsWith("/dashboard/");

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const allowlist = parseAllowedOrigins(env.DASHBOARD_ALLOWED_ORIGINS);
    const isDashboardRequest = isDashboardPath(url.pathname);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: withCors(request, new Headers(), {
          allowCredentials: isDashboardRequest,
          allowlist,
        }),
      });
    }

    try {
      if (url.pathname === "/auth/login" && request.method === "POST") {
        return jsonResponse(
          request,
          { error: "Password auth removed. Use /auth/shoo/login." },
          410,
          {
            allowCredentials: true,
            allowlist,
          },
        );
      }

      if (url.pathname === "/auth/shoo/login" && request.method === "POST") {
        if (!isAllowedOrigin(request.headers.get("origin"), allowlist)) {
          return jsonResponse(request, { error: "Origin not allowed" }, 403, {
            allowCredentials: true,
            allowlist,
          });
        }
        const allowedEmails = requireAllowedEmails(env);
        const sessionSecret = requireSessionSecret(env);
        const origin = request.headers.get("origin");
        if (!origin) {
          return jsonResponse(request, { error: "Origin not allowed" }, 403, {
            allowCredentials: true,
            allowlist,
          });
        }
        const body = (await request.json().catch(() => ({}))) as { id_token?: string };
        if (!body.id_token) {
          return jsonResponse(request, { error: "Unauthorized" }, 401, {
            allowCredentials: true,
            allowlist,
          });
        }
        let payload: JWTPayload;
        try {
          const expectedAudience = buildShooAudience(origin);
          const shooBaseUrl = getShooBaseUrl(env);
          payload = await verifyShooIdToken(body.id_token, shooBaseUrl, expectedAudience);
        } catch {
          return jsonResponse(request, { error: "Unauthorized" }, 401, {
            allowCredentials: true,
            allowlist,
          });
        }
        if (!isAllowedEmailClaim(payload.email, allowedEmails)) {
          return jsonResponse(request, { error: "Forbidden" }, 403, {
            allowCredentials: true,
            allowlist,
          });
        }
        const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
        const token = await signSessionToken({ exp }, sessionSecret);
        return jsonResponse(request, { ok: true }, 200, {
          allowCredentials: true,
          allowlist,
          extraHeaders: {
            "Set-Cookie": createSessionCookie(token),
          },
        });
      }

      if (url.pathname === "/auth/logout" && request.method === "POST") {
        return jsonResponse(request, { ok: true }, 200, {
          allowCredentials: true,
          allowlist,
          extraHeaders: {
            "Set-Cookie": clearSessionCookie(),
          },
        });
      }

      if (url.pathname === "/auth/session" && request.method === "GET") {
        const secret = env.SESSION_SECRET;
        if (!secret) {
          return jsonResponse(request, { authenticated: false }, 200, {
            allowCredentials: true,
            allowlist,
          });
        }
        const cookie = parseCookie(request, DASHBOARD_SESSION_COOKIE);
        const authenticated = cookie ? await verifySessionToken(cookie, secret) : false;
        return jsonResponse(request, { authenticated }, 200, {
          allowCredentials: true,
          allowlist,
        });
      }

      if (url.pathname.startsWith("/dashboard/")) {
        if (!isAllowedOrigin(request.headers.get("origin"), allowlist)) {
          return jsonResponse(request, { error: "Origin not allowed" }, 403, {
            allowCredentials: true,
            allowlist,
          });
        }
        const sessionSecret = requireSessionSecret(env);
        const cookie = parseCookie(request, DASHBOARD_SESSION_COOKIE);
        const authed = cookie ? await verifySessionToken(cookie, sessionSecret) : false;
        if (!authed) {
          return jsonResponse(request, { error: "Unauthorized" }, 401, {
            allowCredentials: true,
            allowlist,
          });
        }
      }

      if (url.pathname === "/dashboard/sessions" && request.method === "GET") {
        const search = url.searchParams.get("q") ?? "";
        let batch = await recoverStaleWarmAllBatch(env);
        if (batch?.status === "running" && batch.active === 0 && batch.cursor < batch.total) {
          ctx.waitUntil(processWarmAllBatchStep(env, batch.id));
          batch = await readWarmAllBatchState(env.DB);
        }
        const rows = await getDashboardRows(env, search);
        return jsonResponse(request, { rows, batch }, 200, {
          allowCredentials: true,
          allowlist,
        });
      }

      if (url.pathname === "/dashboard/warm-all" && request.method === "POST") {
        const batch = await startWarmAllBatch(env, ctx);
        return jsonResponse(request, { ok: true, batch }, 200, {
          allowCredentials: true,
          allowlist,
        });
      }

      if (url.pathname === "/dashboard/probe" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { session_keys?: number[] };
        const sessionKeys = Array.isArray(body.session_keys) ? body.session_keys : [];
        if (sessionKeys.length > PROBE_SESSION_LIMIT) {
          return jsonResponse(
            request,
            { error: `Too many session keys. Maximum is ${PROBE_SESSION_LIMIT}.` },
            400,
            {
              allowCredentials: true,
              allowlist,
            },
          );
        }
        const rows = await probeDashboardSessionKeys(env, sessionKeys);
        return jsonResponse(request, { rows }, 200, {
          allowCredentials: true,
          allowlist,
        });
      }

      if (request.method === "POST" && /^\/dashboard\/sessions\/\d+\/warm$/.test(url.pathname)) {
        const sessionKey = Number(url.pathname.split("/")[3]);
        if (!Number.isFinite(sessionKey)) {
          return jsonResponse(request, { error: "Invalid session key" }, 400, {
            allowCredentials: true,
            allowlist,
          });
        }
        const row = await warmBySessionKey(env, sessionKey);
        return jsonResponse(request, { ok: true, row }, 200, {
          allowCredentials: true,
          allowlist,
        });
      }

      if (url.pathname === "/admin/run" || url.pathname === "/admin/status") {
        const adminToken = requireAdminToken(env);
        if (!isAuthorized(request, adminToken)) {
          return jsonResponse(request, { error: "Unauthorized" }, 401);
        }
      }

      if (request.method === "POST" && url.pathname === "/admin/run") {
        const deepScan = url.searchParams.get("deep") === "1";
        const result = await runPass(env, "manual", deepScan);
        return jsonResponse(request, result, 200);
      }

      if (request.method === "GET" && url.pathname === "/admin/status") {
        const rows = await fetchStatusRows(env.DB);
        return jsonResponse(request, { rows }, 200);
      }

      return jsonResponse(request, { error: "Not found" }, 404, {
        allowCredentials: isDashboardRequest,
        allowlist,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return jsonResponse(request, { error: message }, 500, {
        allowCredentials: isDashboardRequest,
        allowlist,
      });
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const deepScan = controller.cron === "15 3 * * *";
    ctx.waitUntil(runPass(env, "scheduled", deepScan));
  },
};
