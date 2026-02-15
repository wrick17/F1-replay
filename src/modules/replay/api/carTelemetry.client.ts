import type { CarTelemetryPayload } from "../types/carTelemetry.types";
import type { QueryParams } from "./openf1.client";
import { buildQuery } from "./openf1.client";

const CAR_TELEMETRY_WORKER_BASE_URL =
  import.meta.env.RSBUILD_CAR_TELEMETRY_WORKER_URL ??
  // Fallback so this works without a dev-server restart when adding `.env`/rsbuild define.
  "https://openf1-car-telemetry.wrick17worker.workers.dev";

type WorkerTelemetryHit = {
  status: "hit";
  payload: CarTelemetryPayload;
};

type WorkerTelemetryMiss = {
  status: "miss";
  uploadToken: string;
  expiresAt: string;
};

export const fetchCarTelemetryFromWorker = async (
  sessionKey: number,
  signal?: AbortSignal,
): Promise<WorkerTelemetryHit | WorkerTelemetryMiss> => {
  const url = `${CAR_TELEMETRY_WORKER_BASE_URL}/car-telemetry${buildQuery({
    session_key: sessionKey,
  } satisfies QueryParams)}`;
  const response = await fetch(url, { signal });
  if (response.status === 200) {
    const payload = (await response.json()) as CarTelemetryPayload;
    return { status: "hit", payload };
  }
  if (response.status === 202) {
    const data = (await response.json()) as { uploadToken: string; expiresAt: string };
    return { status: "miss", uploadToken: data.uploadToken, expiresAt: data.expiresAt };
  }
  throw new Error(`Car telemetry cache request failed: ${response.status}`);
};

export const uploadCarTelemetryToWorker = async (
  sessionKey: number,
  payload: CarTelemetryPayload,
  uploadToken: string,
  signal?: AbortSignal,
): Promise<void> => {
  const url = `${CAR_TELEMETRY_WORKER_BASE_URL}/car-telemetry`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${uploadToken}`,
    },
    body: JSON.stringify({ session_key: sessionKey, payload }),
    signal,
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Car telemetry cache upload failed: ${response.status}`);
  }
};
