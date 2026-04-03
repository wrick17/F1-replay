import { buildCarTelemetryPayload } from "../../src/modules/replay/warm/buildCarTelemetryPayload";
import type { OpenF1Meeting, OpenF1Session } from "../../src/modules/replay/types/openf1.types";
import type { CarTelemetryPayload } from "../../src/modules/replay/types/carTelemetry.types";
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
  const payload = await buildCarTelemetryPayload(
    session,
    {
      appendLog,
      fetchChunked,
    },
    {
      carDataWindowMs: CAR_DATA_WINDOW_MS,
    },
  );

  await uploadCarTelemetryToWorker(session.session_key, payload, uploadToken);
  appendLog(`[Warm] Upload complete session_key=${session.session_key}`);
};
