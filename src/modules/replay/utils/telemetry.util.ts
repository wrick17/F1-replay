import type {
  OpenF1Lap,
  OpenF1Location,
  OpenF1Position,
  OpenF1Stint,
  TimedSample,
} from "../types/openf1.types";

export const toTimestampMs = (isoDate: string) => new Date(isoDate).getTime();

export const withTimestamp = <T extends { date?: string; date_start?: string }>(
  items: T[],
): TimedSample<T>[] => {
  return items.map((item) => {
    const dateValue = item.date ?? item.date_start;
    return {
      ...item,
      timestampMs: dateValue ? toTimestampMs(dateValue) : Number.NaN,
    };
  });
};

export const groupByDriverNumber = <T extends { driver_number: number }>(
  items: T[],
): Record<number, T[]> => {
  return items.reduce<Record<number, T[]>>((acc, item) => {
    const key = item.driver_number;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});
};

export const sortByTimestamp = <T extends { timestampMs: number }>(items: T[]): T[] => {
  return [...items].sort((a, b) => a.timestampMs - b.timestampMs);
};

export const findSampleAtTime = <T extends { timestampMs: number }>(
  items: T[],
  timestampMs: number,
): T | null => {
  if (!items.length) {
    return null;
  }
  let left = 0;
  let right = items.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const value = items[mid].timestampMs;
    if (value === timestampMs) {
      return items[mid];
    }
    if (value < timestampMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return items[Math.max(0, right)] ?? null;
};

export const interpolateLocation = (
  samples: TimedSample<OpenF1Location>[],
  timestampMs: number,
) => {
  if (!samples.length) {
    return null;
  }
  let leftIndex = 0;
  let rightIndex = samples.length - 1;
  while (leftIndex < rightIndex - 1) {
    const mid = Math.floor((leftIndex + rightIndex) / 2);
    if (samples[mid].timestampMs <= timestampMs) {
      leftIndex = mid;
    } else {
      rightIndex = mid;
    }
  }
  const left = samples[leftIndex];
  const right = samples[rightIndex];
  if (!left || !right) {
    return null;
  }
  if (left.timestampMs === right.timestampMs) {
    return left;
  }
  const ratio = (timestampMs - left.timestampMs) / (right.timestampMs - left.timestampMs);
  return {
    ...left,
    x: left.x + (right.x - left.x) * ratio,
    y: left.y + (right.y - left.y) * ratio,
    z: left.z + (right.z - left.z) * ratio,
    timestampMs,
  };
};

export type NormalizedPosition = {
  x: number;
  y: number;
  z: number;
};

export const normalizePositions = (samples: NormalizedPosition[]) => {
  const validSamples = samples.filter(
    (sample) => Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.z),
  );
  if (!validSamples.length) {
    return { normalized: [], scale: 1, offset: { x: 0, y: 0, z: 0 } };
  }
  const xs = validSamples.map((sample) => sample.x);
  const ys = validSamples.map((sample) => sample.y);
  const zs = validSamples.map((sample) => sample.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;
  const scale = 1 / Math.max(rangeX, rangeY, rangeZ);
  const offset = {
    x: minX + rangeX / 2,
    y: minY + rangeY / 2,
    z: minZ + rangeZ / 2,
  };
  const normalized = validSamples.map((sample) => ({
    x: (sample.x - offset.x) * scale,
    y: (sample.y - offset.y) * scale,
    z: (sample.z - offset.z) * scale,
  }));
  return { normalized, scale, offset };
};

export const getCurrentLap = (laps: TimedSample<OpenF1Lap>[], timestampMs: number) => {
  const sample = findSampleAtTime(laps, timestampMs);
  return sample?.lap_number ?? null;
};

export const getCurrentStint = (stints: OpenF1Stint[], lapNumber: number | null) => {
  if (lapNumber === null) {
    return null;
  }
  return stints.find((stint) => lapNumber >= stint.lap_start && lapNumber <= stint.lap_end) ?? null;
};

export const getCurrentPosition = (
  positions: TimedSample<OpenF1Position>[],
  timestampMs: number,
) => {
  return findSampleAtTime(positions, timestampMs);
};
