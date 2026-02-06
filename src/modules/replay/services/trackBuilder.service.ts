import { TRACK_POINT_QUANTIZE, TRACK_TIME_GAP_MS } from "../constants/replay.constants";
import type { ReplaySessionData } from "../types/openf1.types";
import type { NormalizedPosition } from "../utils/telemetry.util";

type TimedPoint = { x: number; y: number; z: number; timestampMs: number };

export const buildReferencePositions = (data: ReplaySessionData): TimedPoint[] => {
  if (!data.drivers.length) {
    return [];
  }
  const quantize = (value: number) => Math.round(value / TRACK_POINT_QUANTIZE);
  const seen = new Set<string>();
  const gap: TimedPoint = {
    x: Number.NaN,
    y: Number.NaN,
    z: Number.NaN,
    timestampMs: Number.NaN,
  };
  const merged: TimedPoint[] = [];

  for (const driver of data.drivers) {
    const telemetry = data.telemetryByDriver[driver.driver_number];
    if (!telemetry?.locations?.length) {
      continue;
    }
    const sorted = [...telemetry.locations].sort((a, b) => a.timestampMs - b.timestampMs);
    let addedForDriver = false;
    sorted.forEach((sample) => {
      if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
        return;
      }
      const key = `${quantize(sample.x)},${quantize(sample.y)}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      if (!addedForDriver && merged.length > 0) {
        merged.push(gap);
      }
      addedForDriver = true;
      merged.push(sample);
    });
  }

  return merged;
};

type Normalization = {
  scale: number;
  offset: { x: number; y: number; z: number };
};

export const buildTrackPath = (
  referencePositions: TimedPoint[],
  normalization: Normalization,
): NormalizedPosition[] => {
  if (!referencePositions.length) {
    return [];
  }
  const points: NormalizedPosition[] = [];
  let lastTimestamp: number | null = null;
  referencePositions.forEach((sample) => {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.z)) {
      lastTimestamp = null;
      return;
    }
    if (lastTimestamp !== null && sample.timestampMs - lastTimestamp > TRACK_TIME_GAP_MS) {
      points.push({ x: Number.NaN, y: Number.NaN, z: Number.NaN });
    }
    points.push({
      x: (sample.x - normalization.offset.x) * normalization.scale,
      y: (sample.y - normalization.offset.y) * normalization.scale,
      z: (sample.z - normalization.offset.z) * normalization.scale,
    });
    lastTimestamp = sample.timestampMs;
  });
  return points;
};
