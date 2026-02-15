import type { CarTelemetryPayload } from "../../src/modules/replay/types/carTelemetry.types";
import { buildQuery } from "./openf1";
import type { WorkerTelemetryHit, WorkerTelemetryMiss } from "./types";

export const createWorkerClient = (baseUrl: string, appendLog: (line: string) => void) => {
  const fetchCarTelemetryFromWorker = async (
    sessionKey: number,
    signal?: AbortSignal,
  ): Promise<WorkerTelemetryHit | WorkerTelemetryMiss> => {
    const url = `${baseUrl}/car-telemetry${buildQuery({ session_key: sessionKey })}`;
    appendLog(`[Worker] GET ${url}`);
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

  const uploadCarTelemetryToWorker = async (
    sessionKey: number,
    payload: CarTelemetryPayload,
    uploadToken: string,
    signal?: AbortSignal,
  ): Promise<void> => {
    const url = `${baseUrl}/car-telemetry`;
    appendLog(`[Worker] POST ${url} session_key=${sessionKey}`);
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

  return { fetchCarTelemetryFromWorker, uploadCarTelemetryToWorker };
};

