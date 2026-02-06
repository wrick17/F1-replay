import type { OpenF1Driver } from "../types/openf1.types";

export const formatTime = (timestampMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export const formatTrackLabel = (driver: OpenF1Driver) => {
  return driver.name_acronym || driver.full_name;
};

export const formatTelemetryLabel = (driver: OpenF1Driver) => {
  return driver.broadcast_name || driver.full_name;
};

export const normalizeCompound = (compound: string | null) => {
  if (!compound) {
    return null;
  }
  return compound.trim().toUpperCase();
};

export const getCompoundBadge = (compound: string | null) => {
  const upper = normalizeCompound(compound);
  if (!upper) {
    return "-";
  }
  if (upper.startsWith("HARD")) return "H";
  if (upper.startsWith("MED")) return "M";
  if (upper.startsWith("SOF")) return "S";
  if (upper.startsWith("INT")) return "I";
  if (upper.startsWith("WET")) return "W";
  return upper.charAt(0) || "-";
};

export const getCompoundLabel = (compound: string | null) => {
  const upper = normalizeCompound(compound);
  if (!upper) {
    return "Unknown";
  }
  if (upper.startsWith("HARD")) return "Hard";
  if (upper.startsWith("MED")) return "Medium";
  if (upper.startsWith("SOF")) return "Soft";
  if (upper.startsWith("INT")) return "Intermediate";
  if (upper.startsWith("WET")) return "Wet";
  return compound ?? "Unknown";
};
