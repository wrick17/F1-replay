export const API_BASE_URL = process.env.OPENF1_BASE_URL ?? "https://api.openf1.org/v1";
export const WORKER_BASE_URL =
  process.env.CAR_TELEMETRY_WORKER_URL ??
  process.env.RSBUILD_CAR_TELEMETRY_WORKER_URL ??
  "https://openf1-car-telemetry.wrick17worker.workers.dev";

export const SESSION_DELAY_MS = Number(process.env.SESSION_DELAY_MS ?? "750");
// Car telemetry is high-volume; use larger OpenF1 windows to reduce request count / 429s.
export const CAR_DATA_WINDOW_MS = Number(process.env.CAR_DATA_WINDOW_MS ?? "600000");
export const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? "3003");

export const LOG_FILE = "./warm-car-telemetry-cache.log";

export const SUPPORTED_SESSION_TYPES = ["Race", "Sprint", "Qualifying"] as const;
