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

export const createReplayWorkerClient = (baseUrl: string, appendLog: (line: string) => void) => {
  const fetchReplayFromWorker = async (
    sessionKey: number,
    signal?: AbortSignal,
  ): Promise<WorkerHit<ReplaySessionData> | WorkerMiss> => {
    const url = `${baseUrl}/replay${buildQuery({ session_key: sessionKey } satisfies QueryParams)}`;
    appendLog(`[Worker:replay] GET ${url}`);
    const response = await fetch(url, { signal });
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
    const url = `${baseUrl}/replay${buildQuery({ session_key: sessionKey } satisfies QueryParams)}`;
    appendLog(`[Worker:replay] POST ${url} session_key=${sessionKey}`);
    const response = await fetch(url, {
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

  return { fetchReplayFromWorker, uploadReplayToWorker };
};

export const createCarTelemetryWorkerClient = (
  baseUrl: string,
  appendLog: (line: string) => void,
) => {
  const fetchCarTelemetryFromWorker = async (
    sessionKey: number,
    signal?: AbortSignal,
  ): Promise<WorkerHit<CarTelemetryPayload> | WorkerMiss> => {
    const url = `${baseUrl}/car-telemetry${buildQuery({ session_key: sessionKey } satisfies QueryParams)}`;
    appendLog(`[Worker:car] GET ${url}`);
    const response = await fetch(url, { signal });
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
    const url = `${baseUrl}/car-telemetry${buildQuery({ session_key: sessionKey } satisfies QueryParams)}`;
    appendLog(`[Worker:car] POST ${url} session_key=${sessionKey}`);
    const response = await fetch(url, {
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

  return { fetchCarTelemetryFromWorker, uploadCarTelemetryToWorker };
};
