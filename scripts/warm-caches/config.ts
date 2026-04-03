export const API_BASE_URL = process.env.OPENF1_BASE_URL ?? "https://api.openf1.org/v1";

export const REPLAY_WORKER_BASE_URL =
  process.env.WORKER_BASE_URL ??
  process.env.RSBUILD_WORKER_URL ??
  process.env.VITE_WORKER_URL ??
  "https://openf1-proxy.wrick17worker.workers.dev";

export const CAR_TELEMETRY_WORKER_BASE_URL =
  process.env.CAR_TELEMETRY_WORKER_URL ??
  process.env.RSBUILD_CAR_TELEMETRY_WORKER_URL ??
  "https://openf1-car-telemetry.wrick17worker.workers.dev";

const isWorkersDevUrl = (value: string) => {
  try {
    return new URL(value).hostname.endsWith(".workers.dev");
  } catch {
    return value.includes("workers.dev");
  }
};

if (
  process.env.CF_REMOTE !== "1" &&
  (isWorkersDevUrl(REPLAY_WORKER_BASE_URL) || isWorkersDevUrl(CAR_TELEMETRY_WORKER_BASE_URL))
) {
  throw new Error(
    "Refusing to hit deployed Cloudflare workers from local warm script. Set CF_REMOTE=1 to opt in.",
  );
}

export const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? "3002");

export const LOG_FILE = "./warm-caches.log";

// Keep this configurable so you can throttle if OpenF1 gets cranky.
export const SESSION_DELAY_MS = Number(process.env.SESSION_DELAY_MS ?? "750");

// Reasonable, no-knob defaults: retry transient failures but fail fast on auth (401).
// OpenF1 can occasionally go hard-503 for a bit; prefer slow recovery over failing the run.
export const MAX_ATTEMPTS = 8;
export const RETRY_BASE_DELAY_MS = 3000;
export const RETRY_MAX_DELAY_MS = 120000;

export const SUPPORTED_SESSION_TYPES = ["Race", "Sprint", "Qualifying"] as const;
export type SupportedSessionType = (typeof SUPPORTED_SESSION_TYPES)[number];
