import type { OpenF1Meeting, OpenF1Session } from "../../src/modules/replay/types/openf1.types";
import type { OpenF1CarData } from "../../src/modules/replay/types/openf1.types";
import type { CarTelemetryPayload } from "../../src/modules/replay/types/carTelemetry.types";
import {
  createDownsampleState,
  finalizeCarTelemetryPayload,
  ingestCarDataChunk,
} from "../../src/modules/replay/services/carTelemetry.service";
import { CAR_DATA_WINDOW_MS } from "./config";

type WarmSessionDeps = {
  appendLog: (line: string) => void;
  fetchChunked: <T extends { date?: string }>(
    path: string,
    params: Record<string, string | number>,
    startMs: number,
    endMs: number,
    windowMs: number,
    onChunk: (chunk: T[], chunkEndMs: number) => void,
  ) => Promise<number>;
  uploadCarTelemetryToWorker: (
    sessionKey: number,
    payload: CarTelemetryPayload,
    uploadToken: string,
  ) => Promise<void>;
};

export const warmSession = async (
  _meeting: OpenF1Meeting,
  session: OpenF1Session,
  uploadToken: string,
  deps: WarmSessionDeps,
) => {
  const { appendLog, fetchChunked, uploadCarTelemetryToWorker } = deps;
  const sessionStartMs = Date.parse(session.date_start);
  const sessionEndMs = Date.parse(session.date_end);
  appendLog(`[Warm] Building car telemetry payload session_key=${session.session_key}`);

  const state = createDownsampleState(session.session_key, 500);
  const total = await fetchChunked<OpenF1CarData>(
    "car_data",
    { session_key: session.session_key },
    sessionStartMs,
    sessionEndMs,
    CAR_DATA_WINDOW_MS,
    (chunk) => ingestCarDataChunk(state, chunk),
  );
  appendLog(`[Warm] car_data samples=${total} session_key=${session.session_key}`);

  const payload = finalizeCarTelemetryPayload(state);
  await uploadCarTelemetryToWorker(session.session_key, payload, uploadToken);
  appendLog(`[Warm] Upload complete session_key=${session.session_key}`);
};

