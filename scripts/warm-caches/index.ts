import type { OpenF1Meeting, OpenF1Session } from "../../src/modules/replay/types/openf1.types";
import { sleep } from "../../src/modules/replay/api/rateLimiter";
import { warmSession as warmReplaySession } from "../warm-replay-cache/warmSession";
import { warmSession as warmCarTelemetrySession } from "../warm-car-telemetry-cache/warmSession";
import {
  API_BASE_URL,
  CAR_TELEMETRY_WORKER_BASE_URL,
  DASHBOARD_PORT,
  MAX_ATTEMPTS,
  REPLAY_WORKER_BASE_URL,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  SESSION_DELAY_MS,
  SUPPORTED_SESSION_TYPES,
} from "./config";
import { startDashboard } from "./dashboard";
import { asApiError, FatalAuthError } from "./errors";
import { buildMeetingIndex, fetchAllMeetings, filterEndedMeetings, findSessionByType } from "./meetings";
import { initLogger } from "./logger";
import { createOpenF1Client } from "./openf1";
import { retry } from "./retry";
import { createCarTelemetryWorkerClient, createReplayWorkerClient } from "./workers";
import type { CacheTaskStatus, WarmSessionRow, WarmStatus } from "./types";

const run = async () => {
  const startedAtMs = Date.now();
  const status: WarmStatus = {
    startedAt: new Date(startedAtMs).toISOString(),
    updatedAt: new Date(startedAtMs).toISOString(),
    current: null,
    sessionsTotal: 0,
    sessionsDiscovered: 0,
    sessions: [],
    recentFailures: [],
    recentLogs: [],
  };

  const { appendLog, recordFailure, touchStatus } = initLogger(status);

  const dashboardUrl = startDashboard(status, DASHBOARD_PORT);
  appendLog(`Dashboard: ${dashboardUrl}`);

  appendLog(`Using OpenF1: ${API_BASE_URL}`);
  appendLog(`Using replay worker: ${REPLAY_WORKER_BASE_URL}`);
  appendLog(`Using car telemetry worker: ${CAR_TELEMETRY_WORKER_BASE_URL}`);
  appendLog("Log file: ./warm-caches.log");

  const openf1Raw = createOpenF1Client(API_BASE_URL, appendLog);
  const replayWorkerRaw = createReplayWorkerClient(REPLAY_WORKER_BASE_URL, appendLog);
  const carWorkerRaw = createCarTelemetryWorkerClient(CAR_TELEMETRY_WORKER_BASE_URL, appendLog);

  const openf1 = {
    fetchOpenF1: <T>(path: string, params: Record<string, string | number>, signal?: AbortSignal) =>
      retry(() => openf1Raw.fetchOpenF1<T>(path, params, signal), {
        label: `OpenF1 ${path}`,
        maxAttempts: MAX_ATTEMPTS,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        maxDelayMs: RETRY_MAX_DELAY_MS,
        appendLog,
      }),
    fetchChunked: openf1Raw.fetchChunked,
  };

  const replayWorker = {
    fetchReplayFromWorker: (sessionKey: number, signal?: AbortSignal) =>
      retry(() => replayWorkerRaw.fetchReplayFromWorker(sessionKey, signal), {
        label: `Worker replay GET session_key=${sessionKey}`,
        maxAttempts: MAX_ATTEMPTS,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        maxDelayMs: RETRY_MAX_DELAY_MS,
        appendLog,
      }),
    uploadReplayToWorker: (sessionKey: number, payload: any, uploadToken: string, signal?: AbortSignal) =>
      retry(() => replayWorkerRaw.uploadReplayToWorker(sessionKey, payload, uploadToken, signal), {
        label: `Worker replay POST session_key=${sessionKey}`,
        maxAttempts: MAX_ATTEMPTS,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        maxDelayMs: RETRY_MAX_DELAY_MS,
        appendLog,
      }),
  };

  const carWorker = {
    fetchCarTelemetryFromWorker: (sessionKey: number, signal?: AbortSignal) =>
      retry(() => carWorkerRaw.fetchCarTelemetryFromWorker(sessionKey, signal), {
        label: `Worker car GET session_key=${sessionKey}`,
        maxAttempts: MAX_ATTEMPTS,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        maxDelayMs: RETRY_MAX_DELAY_MS,
        appendLog,
      }),
    uploadCarTelemetryToWorker: (sessionKey: number, payload: any, uploadToken: string, signal?: AbortSignal) =>
      retry(() => carWorkerRaw.uploadCarTelemetryToWorker(sessionKey, payload, uploadToken, signal), {
        label: `Worker car POST session_key=${sessionKey}`,
        maxAttempts: MAX_ATTEMPTS,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        maxDelayMs: RETRY_MAX_DELAY_MS,
        appendLog,
      }),
  };

  const now = Date.now();
  const meetings = await retry(() => fetchAllMeetings((path, params) => openf1.fetchOpenF1(path, params)), {
    label: "OpenF1 meetings",
    maxAttempts: MAX_ATTEMPTS,
    baseDelayMs: RETRY_BASE_DELAY_MS,
    maxDelayMs: RETRY_MAX_DELAY_MS,
    appendLog,
  });

  const endedMeetings = filterEndedMeetings(meetings, now);
  const { byYear, years } = buildMeetingIndex(endedMeetings);

  const mkTask = (): CacheTaskStatus => ({
    phase: "pending",
    xCache: null,
    startedAt: null,
    endedAt: null,
    durationMs: null,
    error: null,
  });

  const sessionsByKey = new Map<string, WarmSessionRow>();
  const sessionTypeRank = (sessionType: string) => {
    // Desired display order within a weekend.
    if (sessionType === "Qualifying") return 0;
    if (sessionType === "Sprint") return 1;
    if (sessionType === "Race") return 2;
    return 99;
  };
  const upsertRow = (row: WarmSessionRow) => {
    sessionsByKey.set(row.key, row);
    status.sessions = Array.from(sessionsByKey.values()).sort((a, b) => {
      // Newest year first, but within a year show rounds in ascending order (R1, R2, ...).
      if (a.year !== b.year) return b.year - a.year;
      if (a.round !== b.round) return a.round - b.round;
      const aRank = sessionTypeRank(a.sessionType);
      const bRank = sessionTypeRank(b.sessionType);
      if (aRank !== bRank) return aRank - bRank;
      return a.sessionKey - b.sessionKey;
    });
    status.sessionsDiscovered = status.sessions.length;
    touchStatus();
  };

  const ensureRow = (meeting: OpenF1Meeting, session: OpenF1Session, sessionType: string, round: number) => {
    const key = `${session.session_key}`;
    const existing = sessionsByKey.get(key);
    if (existing) return existing;

    const row: WarmSessionRow = {
      key,
      sessionKey: session.session_key,
      meetingKey: session.meeting_key,
      year: session.year,
      round,
      meetingName: meeting.meeting_name,
      countryName: meeting.country_name,
      circuitShortName: meeting.circuit_short_name,
      sessionType,
      sessionName: session.session_name,
      dateStart: session.date_start,
      dateEnd: session.date_end,
      replay: mkTask(),
      carTelemetry: mkTask(),
      updatedAt: new Date().toISOString(),
    };
    upsertRow(row);
    return row;
  };

  const mark = (row: WarmSessionRow, which: "replay" | "carTelemetry", patch: Partial<CacheTaskStatus>) => {
    const prev = row[which];
    row[which] = { ...prev, ...patch };
    row.updatedAt = new Date().toISOString();
    upsertRow(row);
  };

  // Pre-scan: discover all sessions up front so the dashboard can show pending work immediately.
  const endedSessionsByMeetingKey = new Map<number, OpenF1Session[]>();
  appendLog(`[Scan] Discovering ended sessions for ${endedMeetings.length} meetings...`);

  for (const year of years) {
    const yearMeetings = byYear.get(year) ?? [];
    for (let idx = 0; idx < yearMeetings.length; idx += 1) {
      const meeting = yearMeetings[idx];
      const round = idx + 1;

      status.current = `[Scan] ${year} R${round} ${meeting.meeting_name}`;
      touchStatus();

      const sessions = await retry(
        () =>
          openf1.fetchOpenF1<OpenF1Session[]>("sessions", {
            meeting_key: meeting.meeting_key,
          }),
        {
          label: `OpenF1 sessions meeting_key=${meeting.meeting_key}`,
          maxAttempts: MAX_ATTEMPTS,
          baseDelayMs: RETRY_BASE_DELAY_MS,
          maxDelayMs: RETRY_MAX_DELAY_MS,
          appendLog,
        },
      );

      const endedSessions = sessions.filter(
        (s) => Number.isFinite(Date.parse(s.date_end)) && Date.parse(s.date_end) <= now,
      );
      endedSessionsByMeetingKey.set(meeting.meeting_key, endedSessions);

      for (const sessionType of SUPPORTED_SESSION_TYPES) {
        const session = findSessionByType(endedSessions, sessionType);
        if (!session) {
          continue;
        }
        status.sessionsTotal += 1;
        ensureRow(meeting, session, sessionType, round);
      }
    }
  }

  appendLog(`[Scan] Done. sessionsDiscovered=${status.sessionsDiscovered} sessionsTotal=${status.sessionsTotal}`);

  for (const year of years) {
    const yearMeetings = byYear.get(year) ?? [];
    for (let idx = 0; idx < yearMeetings.length; idx += 1) {
      const meeting = yearMeetings[idx];
      const round = idx + 1;
      const endedSessions = endedSessionsByMeetingKey.get(meeting.meeting_key) ?? [];

      for (const sessionType of SUPPORTED_SESSION_TYPES) {
        const session = findSessionByType(endedSessions, sessionType);
        if (!session) {
          appendLog(`Missing ${sessionType} for ${year} round ${round} (${meeting.meeting_name}).`);
          continue;
        }

        const row = ensureRow(meeting, session, sessionType, round);
        const label = `${year} R${round} ${meeting.meeting_name} - ${sessionType} (session_key=${session.session_key})`;
        status.current = label;
        touchStatus();
        appendLog(`[Warm] Start ${label}`);

        try {
          // Replay
          mark(row, "replay", { phase: "in_progress", startedAt: new Date().toISOString(), error: null });
          const replayStart = Date.now();
          const replayCached = await replayWorker.fetchReplayFromWorker(session.session_key);
          if (replayCached.status === "hit") {
            mark(row, "replay", {
              phase: "hit",
              xCache: replayCached.xCache ?? null,
              endedAt: new Date().toISOString(),
              durationMs: Date.now() - replayStart,
            });
            appendLog(`[Warm] Replay cache hit ${label}`);
          } else {
            await warmReplaySession(meeting, session, replayCached.uploadToken, {
              appendLog,
              fetchOpenF1: (path, params) => openf1.fetchOpenF1(path, params),
              fetchChunked: (path, params, startMs, endMs, windowMs, onChunk) =>
                retry(
                  () =>
                    openf1Raw.fetchChunked<any>(
                      path,
                      params,
                      startMs,
                      endMs,
                      windowMs,
                      onChunk,
                      undefined,
                    ),
                  {
                    label: `OpenF1 chunked ${path} session_key=${session.session_key}`,
                    maxAttempts: MAX_ATTEMPTS,
                    baseDelayMs: RETRY_BASE_DELAY_MS,
                    maxDelayMs: RETRY_MAX_DELAY_MS,
                    appendLog,
                  },
                ),
              uploadReplayToWorker: (sessionKey, payload, uploadToken) =>
                replayWorker.uploadReplayToWorker(sessionKey, payload, uploadToken),
            });
            mark(row, "replay", {
              phase: "warmed",
              xCache: replayCached.xCache ?? null,
              endedAt: new Date().toISOString(),
              durationMs: Date.now() - replayStart,
            });
            appendLog(`[Warm] Replay warmed ${label}`);
          }

          // Car telemetry
          mark(row, "carTelemetry", { phase: "in_progress", startedAt: new Date().toISOString(), error: null });
          const carStart = Date.now();
          const carCached = await carWorker.fetchCarTelemetryFromWorker(session.session_key);
          if (carCached.status === "hit") {
            mark(row, "carTelemetry", {
              phase: "hit",
              xCache: carCached.xCache ?? null,
              endedAt: new Date().toISOString(),
              durationMs: Date.now() - carStart,
            });
            appendLog(`[Warm] Car telemetry cache hit ${label}`);
          } else {
            await warmCarTelemetrySession(meeting, session, carCached.uploadToken, {
              appendLog,
              fetchChunked: (path, params, startMs, endMs, windowMs, onChunk) =>
                retry(
                  () =>
                    openf1Raw.fetchChunked<any>(
                      path,
                      params,
                      startMs,
                      endMs,
                      windowMs,
                      onChunk,
                      undefined,
                    ),
                  {
                    label: `OpenF1 chunked ${path} session_key=${session.session_key}`,
                    maxAttempts: MAX_ATTEMPTS,
                    baseDelayMs: RETRY_BASE_DELAY_MS,
                    maxDelayMs: RETRY_MAX_DELAY_MS,
                    appendLog,
                  },
                ),
              uploadCarTelemetryToWorker: (sessionKey, payload, uploadToken) =>
                carWorker.uploadCarTelemetryToWorker(sessionKey, payload, uploadToken),
            });
            mark(row, "carTelemetry", {
              phase: "warmed",
              xCache: carCached.xCache ?? null,
              endedAt: new Date().toISOString(),
              durationMs: Date.now() - carStart,
            });
            appendLog(`[Warm] Car telemetry warmed ${label}`);
          }
        } catch (err) {
          const apiErr = asApiError(err);
          const message = apiErr
            ? `${apiErr.message} status=${apiErr.status} url=${apiErr.url}`
            : err instanceof Error
              ? err.message
              : String(err);
          recordFailure(`${label}: ${message}`);
          // Attribute to whichever cache is in progress.
          const replayPhase = row.replay.phase;
          const carPhase = row.carTelemetry.phase;
          if (replayPhase === "in_progress") {
            mark(row, "replay", { phase: "failed", endedAt: new Date().toISOString(), error: message });
          }
          if (carPhase === "in_progress") {
            mark(row, "carTelemetry", { phase: "failed", endedAt: new Date().toISOString(), error: message });
          }
          appendLog(`[Warm] Failed ${label} error=${message}`);
          if (err instanceof FatalAuthError) {
            appendLog("[Warm] Fatal auth error detected. Stopping warmer.");
            throw err;
          }
        }

        appendLog(`[Warm] Done ${label}`);
        if (SESSION_DELAY_MS > 0) {
          await sleep(SESSION_DELAY_MS);
        }
      }
    }
  }

  status.current = "Done";
  touchStatus();
  appendLog(`Done. sessions=${status.sessionsDiscovered} delayMs=${SESSION_DELAY_MS}`);
};

run().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`Combined cache warmer failed: ${message}`);
  process.exitCode = 1;
});
