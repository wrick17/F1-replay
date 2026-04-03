import {
  createDownsampleState,
  finalizeCarTelemetryPayload,
  ingestCarDataChunk,
} from "../services/carTelemetry.service";
import type { CarTelemetryPayload } from "../types/carTelemetry.types";
import type { OpenF1CarData, OpenF1Session } from "../types/openf1.types";

type BuildCarTelemetryPayloadDeps = {
  appendLog: (line: string) => void;
  fetchChunked: <T extends { date?: string }>(
    path: string,
    params: Record<string, string | number>,
    startMs: number,
    endMs: number,
    windowMs: number,
    onChunk: (chunk: T[], chunkEndMs: number) => void,
  ) => Promise<number>;
};

type BuildCarTelemetryPayloadConfig = {
  carDataWindowMs: number;
};

export const buildCarTelemetryPayload = async (
  session: OpenF1Session,
  deps: BuildCarTelemetryPayloadDeps,
  config: BuildCarTelemetryPayloadConfig,
): Promise<CarTelemetryPayload> => {
  const { appendLog, fetchChunked } = deps;
  const { carDataWindowMs } = config;

  const sessionStartMs = Date.parse(session.date_start);
  const sessionEndMs = Date.parse(session.date_end);
  appendLog(`[Warm] Building car telemetry payload session_key=${session.session_key}`);

  const state = createDownsampleState(session.session_key, 500);
  const total = await fetchChunked<OpenF1CarData>(
    "car_data",
    { session_key: session.session_key },
    sessionStartMs,
    sessionEndMs,
    carDataWindowMs,
    (chunk) => ingestCarDataChunk(state, chunk),
  );
  appendLog(`[Warm] car_data samples=${total} session_key=${session.session_key}`);

  return finalizeCarTelemetryPayload(state);
};
