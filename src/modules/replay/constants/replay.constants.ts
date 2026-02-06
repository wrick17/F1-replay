export const ALLOWED_SESSION_TYPES = ["Race", "Sprint", "Qualifying"] as const;

export const TRACK_TIME_GAP_MS = 2000;

export const TRACK_POINT_QUANTIZE = 5;

export const SPEED_OPTIONS = [0.5, 1, 2, 4];

export const getDefaultYear = () => new Date().getFullYear() - 1;
