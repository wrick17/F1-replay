import type { ReplaySessionData } from "../../src/modules/replay/types/openf1.types";
import type { SUPPORTED_SESSION_TYPES } from "./config";

export type SupportedSessionType = (typeof SUPPORTED_SESSION_TYPES)[number];

export type WorkerReplayHit = {
  status: "hit";
  payload: ReplaySessionData;
};

export type WorkerReplayMiss = {
  status: "miss";
  uploadToken: string;
  expiresAt: string;
};

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type WarmStatus = {
  startedAt: string;
  updatedAt: string;
  current?: string | null;
  totalSessions: number;
  warmed: number;
  skipped: number;
  failed: number;
  recentFailures: string[];
  recentLogs: string[];
};
