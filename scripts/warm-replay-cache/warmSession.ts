import { buildReplayPayload } from "../../src/modules/replay/warm/buildReplayPayload";
import type { OpenF1Meeting, OpenF1Session, ReplaySessionData } from "../../src/modules/replay/types/openf1.types";
import {
  LOCATION_WINDOW_MS,
  POSITION_OFFSET_MS,
  POSITION_WINDOW_MS,
} from "./config";

type WarmSessionDeps = {
  appendLog: (line: string) => void;
  fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>;
  fetchChunked: <T extends { date?: string }>(
    path: string,
    params: Record<string, string | number>,
    startMs: number,
    endMs: number,
    windowMs: number,
    onChunk: (chunk: T[], chunkEndMs: number) => void,
  ) => Promise<number>;
  uploadReplayToWorker: (
    sessionKey: number,
    payload: ReplaySessionData,
    uploadToken: string,
  ) => Promise<void>;
};

export const warmSession = async (
  meeting: OpenF1Meeting,
  session: OpenF1Session,
  uploadToken: string,
  deps: WarmSessionDeps,
) => {
  const { appendLog, fetchOpenF1, fetchChunked, uploadReplayToWorker } = deps;
  const baseData = (await buildReplayPayload(
    meeting,
    session,
    {
      appendLog,
      fetchOpenF1,
      fetchChunked,
    },
    {
      locationWindowMs: LOCATION_WINDOW_MS,
      positionWindowMs: POSITION_WINDOW_MS,
      positionOffsetMs: POSITION_OFFSET_MS,
    },
  )) satisfies ReplaySessionData;

  await uploadReplayToWorker(session.session_key, baseData, uploadToken);
  appendLog(`[Warm] Upload complete session_key=${session.session_key}`);
};
