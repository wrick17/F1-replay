import type { CarTelemetryPayload } from "../../src/modules/replay/types/carTelemetry.types";
import type { ReplaySessionData } from "../../src/modules/replay/types/openf1.types";
import type { QueryParams } from "../warm-replay-cache/types";
import { ApiError } from "./errors";
import { buildQuery } from "./openf1";

export type WorkerHit<T> = { status: "hit"; payload: T; xCache?: string | null };
export type WorkerMiss = {
  status: "miss";
  uploadToken: string;
  expiresAt: string;
  xCache?: string | null;
};
export type WorkerStatusProbe = { status: "hit" | "miss"; xCache?: string | null };

const normalizeBaseUrl = (baseUrl: string, endpointPath: string) => {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith(endpointPath) ? trimmed.slice(0, -endpointPath.length) : trimmed;
};

const WORKER_FETCH_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = WORKER_FETCH_TIMEOUT_MS) => {
  const externalSignal = init.signal ?? undefined;
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && typeof (AbortSignal as { timeout?: unknown }).timeout === "function"
      ? (AbortSignal as { timeout: (ms: number) => AbortSignal }).timeout(timeoutMs)
      : undefined;
  const combinedSignal =
    externalSignal && timeoutSignal && typeof (AbortSignal as { any?: unknown }).any === "function"
      ? (AbortSignal as { any: (signals: AbortSignal[]) => AbortSignal }).any([
          externalSignal,
          timeoutSignal,
        ])
      : externalSignal ?? timeoutSignal;
  try {
    return await fetch(url, {
      ...init,
      signal: combinedSignal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(`Worker request timed out after ${timeoutMs}ms`, 504, url);
    }
    throw error;
  }
};

export const createReplayWorkerClient = (baseUrl: string, appendLog: (line: string) => void) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, "/replay");
  const fetchReplayFromWorker = async (
    sessionKey: number,
    signal?: AbortSignal,
  ): Promise<WorkerHit<ReplaySessionData> | WorkerMiss> => {
    const url = `${normalizedBaseUrl}/replay${buildQuery({ session_key: sessionKey } satisfies QueryParams)}`;
    appendLog(`[Worker:replay] GET ${url}`);
    const response = await fetchWithTimeout(url, { signal });
    const xCache = response.headers.get("x-cache");
    if (response.status === 200) {
      const payload = (await response.json()) as ReplaySessionData;
      return { status: "hit", payload, xCache };
    }
    if (response.status === 202) {
      const data = (await response.json()) as { uploadToken: string; expiresAt: string };
      return { status: "miss", uploadToken: data.uploadToken, expiresAt: data.expiresAt, xCache };
    }
    throw new ApiError(`Replay cache request failed: ${response.status}`, response.status, url);
  };

  const uploadReplayToWorker = async (
    sessionKey: number,
    payload: ReplaySessionData,
    uploadToken: string,
    signal?: AbortSignal,
  ): Promise<void> => {
    const url = `${normalizedBaseUrl}/replay${buildQuery({ session_key: sessionKey } satisfies QueryParams)}`;
    appendLog(`[Worker:replay] POST ${url} session_key=${sessionKey}`);
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${uploadToken}`,
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok && response.status !== 204) {
      throw new ApiError(`Replay cache upload failed: ${response.status}`, response.status, url);
    }
  };

  const probeReplayFromWorker = async (
    sessionKey: number,
    signal?: AbortSignal,
  ): Promise<WorkerStatusProbe> => {
    const url = `${normalizedBaseUrl}/replay${buildQuery({ session_key: sessionKey, status: 1 } satisfies QueryParams)}`;
    appendLog(`[Worker:replay] GET(status) ${url}`);
    const response = await fetchWithTimeout(url, { signal });
    const xCache = response.headers.get("x-cache");
    if (response.status === 200) {
      return { status: "hit", xCache };
    }
    if (response.status === 202) {
      return { status: "miss", xCache };
    }
    throw new ApiError(`Replay cache status request failed: ${response.status}`, response.status, url);
  };

  return { fetchReplayFromWorker, uploadReplayToWorker, probeReplayFromWorker };
};

export const createCarTelemetryWorkerClient = (
  baseUrl: string,
  appendLog: (line: string) => void,
) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, "/car-telemetry");
  const fetchCarTelemetryFromWorker = async (
    sessionKey: number,
    signal?: AbortSignal,
  ): Promise<WorkerHit<CarTelemetryPayload> | WorkerMiss> => {
    const url = `${normalizedBaseUrl}/car-telemetry${buildQuery({ session_key: sessionKey } satisfies QueryParams)}`;
    appendLog(`[Worker:car] GET ${url}`);
    const response = await fetchWithTimeout(url, { signal });
    const xCache = response.headers.get("x-cache");
    if (response.status === 200) {
      const payload = (await response.json()) as CarTelemetryPayload;
      return { status: "hit", payload, xCache };
    }
    if (response.status === 202) {
      const data = (await response.json()) as { uploadToken: string; expiresAt: string };
      return { status: "miss", uploadToken: data.uploadToken, expiresAt: data.expiresAt, xCache };
    }
    throw new ApiError(
      `Car telemetry cache request failed: ${response.status}`,
      response.status,
      url,
    );
  };

  const uploadCarTelemetryToWorker = async (
    sessionKey: number,
    payload: CarTelemetryPayload,
    uploadToken: string,
    signal?: AbortSignal,
  ): Promise<void> => {
    const url = `${normalizedBaseUrl}/car-telemetry${buildQuery({ session_key: sessionKey } satisfies QueryParams)}`;
    appendLog(`[Worker:car] POST ${url} session_key=${sessionKey}`);
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${uploadToken}`,
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok && response.status !== 204) {
      throw new ApiError(
        `Car telemetry cache upload failed: ${response.status}`,
        response.status,
        url,
      );
    }
  };

  const probeCarTelemetryFromWorker = async (
    sessionKey: number,
    signal?: AbortSignal,
  ): Promise<WorkerStatusProbe> => {
    const url = `${normalizedBaseUrl}/car-telemetry${buildQuery({ session_key: sessionKey, status: 1 } satisfies QueryParams)}`;
    appendLog(`[Worker:car] GET(status) ${url}`);
    const response = await fetchWithTimeout(url, { signal });
    const xCache = response.headers.get("x-cache");
    if (response.status === 200) {
      return { status: "hit", xCache };
    }
    if (response.status === 202) {
      return { status: "miss", xCache };
    }
    throw new ApiError(
      `Car telemetry cache status request failed: ${response.status}`,
      response.status,
      url,
    );
  };

  return { fetchCarTelemetryFromWorker, uploadCarTelemetryToWorker, probeCarTelemetryFromWorker };
};
