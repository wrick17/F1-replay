import type { ReplaySessionData } from "../../src/modules/replay/types/openf1.types";
import { buildQuery } from "./openf1";
import type { WorkerReplayHit, WorkerReplayMiss } from "./types";

export const createWorkerClient = (baseUrl: string, appendLog: (line: string) => void) => {
  const fetchReplayFromWorker = async (
    sessionKey: number,
    signal?: AbortSignal,
  ): Promise<WorkerReplayHit | WorkerReplayMiss> => {
    const url = `${baseUrl}/replay${buildQuery({ session_key: sessionKey })}`;
    appendLog(`[Worker] GET ${url}`);
    const response = await fetch(url, { signal });
    if (response.status === 200) {
      const payload = (await response.json()) as ReplaySessionData;
      return { status: "hit", payload };
    }
    if (response.status === 202) {
      const data = (await response.json()) as { uploadToken: string; expiresAt: string };
      return { status: "miss", uploadToken: data.uploadToken, expiresAt: data.expiresAt };
    }
    throw new Error(`Replay cache request failed: ${response.status}`);
  };

  const uploadReplayToWorker = async (
    sessionKey: number,
    payload: ReplaySessionData,
    uploadToken: string,
    signal?: AbortSignal,
  ): Promise<void> => {
    const url = `${baseUrl}/replay`;
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
      throw new Error(`Replay cache upload failed: ${response.status}`);
    }
  };

  return { fetchReplayFromWorker, uploadReplayToWorker };
};
