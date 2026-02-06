export const ALLOWED_SESSION_TYPES = ["Race", "Sprint", "Qualifying"] as const;

export const TRACK_TIME_GAP_MS = 2000;

export const TRACK_POINT_QUANTIZE = 5;

export const SPEED_OPTIONS = [0.5, 1, 2, 4];

export const SKIP_INTERVAL_OPTIONS = [10_000, 30_000, 60_000, 300_000] as const;

export const SKIP_INTERVAL_LABELS: Record<number, string> = {
  10000: "10s",
  30000: "30s",
  60000: "1m",
  300000: "5m",
};

export const getDefaultYear = () => new Date().getFullYear() - 1;
