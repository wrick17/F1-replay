export const API_BASE_URL = process.env.OPENF1_BASE_URL ?? "https://api.openf1.org/v1";
export const WORKER_BASE_URL =
  process.env.WORKER_BASE_URL ??
  process.env.RSBUILD_WORKER_URL ??
  process.env.VITE_WORKER_URL ??
  "https://openf1-proxy.wrick17worker.workers.dev";

export const SESSION_DELAY_MS = Number(process.env.SESSION_DELAY_MS ?? "750");
export const LOCATION_WINDOW_MS = Number(process.env.LOCATION_WINDOW_MS ?? "180000");
export const POSITION_WINDOW_MS = Number(process.env.POSITION_WINDOW_MS ?? "600000");
export const POSITION_OFFSET_MS = Number(process.env.POSITION_OFFSET_MS ?? "3600000");
export const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? "3002");

export const LOG_FILE = "./warm-replay-cache.log";

export const SUPPORTED_SESSION_TYPES = ["Race", "Sprint", "Qualifying"] as const;
