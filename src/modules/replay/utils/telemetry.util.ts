import { TRACK_TIME_GAP_MS } from "../constants/replay.constants";
import type { CarTelemetrySample } from "../types/carTelemetry.types";
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

const locationScaleCache = new WeakMap<
  TimedSample<OpenF1Location>[],
  { speed: CarTelemetrySample[]; value: number | null }
>();
const speedIntegralCache = new WeakMap<CarTelemetrySample[], number[]>();

const sampleIndexAt = <T extends { timestampMs: number }>(samples: T[], timestampMs: number) => {
  let left = 0;
  let right = samples.length - 1;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (samples[middle].timestampMs <= timestampMs) left = middle + 1;
    else right = middle - 1;
  }
  return Math.max(0, right);
};

const speedAt = (samples: CarTelemetrySample[], timestampMs: number) => {
  if (!samples.length) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (timestampMs < first.timestampMs) {
    return first.timestampMs - timestampMs <= TRACK_TIME_GAP_MS ? first.speed : null;
  }
  if (timestampMs > last.timestampMs) {
    return timestampMs - last.timestampMs <= TRACK_TIME_GAP_MS ? last.speed : null;
  }
  const index = sampleIndexAt(samples, timestampMs);
  const before = samples[index];
  const after = samples[index + 1];
  if (!after || timestampMs <= before.timestampMs) return before.speed;
  if (after.timestampMs - before.timestampMs > TRACK_TIME_GAP_MS) return null;
  const ratio = (timestampMs - before.timestampMs) / (after.timestampMs - before.timestampMs);
  return before.speed + (after.speed - before.speed) * ratio;
};

const speedIntegralAt = (samples: CarTelemetrySample[], timestampMs: number) => {
  let cumulative = speedIntegralCache.get(samples);
  if (!cumulative) {
    cumulative = [0];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      cumulative.push(
        cumulative[index - 1] +
          ((Math.max(0, previous.speed) + Math.max(0, current.speed)) / 2) *
            (current.timestampMs - previous.timestampMs),
      );
    }
    speedIntegralCache.set(samples, cumulative);
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (timestampMs <= first.timestampMs) {
    return -Math.max(0, first.speed) * (first.timestampMs - timestampMs);
  }
  if (timestampMs >= last.timestampMs) {
    return (
      cumulative[cumulative.length - 1] + Math.max(0, last.speed) * (timestampMs - last.timestampMs)
    );
  }
  const index = sampleIndexAt(samples, timestampMs);
  const before = samples[index];
  const currentSpeed = speedAt(samples, timestampMs) ?? before.speed;
  return (
    cumulative[index] +
    ((Math.max(0, before.speed) + Math.max(0, currentSpeed)) / 2) *
      (timestampMs - before.timestampMs)
  );
};

export const speedWeightedProgress = (
  samples: CarTelemetrySample[],
  startMs: number,
  endMs: number,
  currentMs: number,
) => {
  if (!samples.length || endMs <= startMs || currentMs <= startMs || currentMs >= endMs) {
    return null;
  }
  const first = samples[0]?.timestampMs ?? Number.POSITIVE_INFINITY;
  const last = samples[samples.length - 1]?.timestampMs ?? Number.NEGATIVE_INFINITY;
  if (first - startMs > TRACK_TIME_GAP_MS || endMs - last > TRACK_TIME_GAP_MS) return null;
  const firstIndex = sampleIndexAt(samples, startMs);
  let lastIndex = sampleIndexAt(samples, endMs);
  if (samples[lastIndex]?.timestampMs < endMs && lastIndex + 1 < samples.length) lastIndex += 1;
  for (let index = firstIndex + 1; index <= lastIndex; index += 1) {
    if (samples[index].timestampMs - samples[index - 1].timestampMs > TRACK_TIME_GAP_MS)
      return null;
  }
  const start = speedIntegralAt(samples, startMs);
  const total = speedIntegralAt(samples, endMs) - start;
  const covered = speedIntegralAt(samples, currentMs) - start;
  return total > 0 ? covered / total : null;
};

const coordinateUnitsPerMeter = (
  locations: TimedSample<OpenF1Location>[],
  speeds: CarTelemetrySample[],
) => {
  const cached = locationScaleCache.get(locations);
  if (cached?.speed === speeds) return cached.value;
  const ratios: number[] = [];
  for (let index = 1; index < locations.length; index += 1) {
    const previous = locations[index - 1];
    const current = locations[index];
    const elapsedMs = current.timestampMs - previous.timestampMs;
    if (elapsedMs < 50 || elapsedMs > 1_000) continue;
    const midpoint = (previous.timestampMs + current.timestampMs) / 2;
    if (midpoint < speeds[0]?.timestampMs || midpoint > speeds[speeds.length - 1]?.timestampMs)
      continue;
    const speed = speedAt(speeds, midpoint);
    if (!speed || speed < 20) continue;
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (distance > 0) ratios.push(distance / ((speed * elapsedMs) / 3_600));
  }
  ratios.sort((a, b) => a - b);
  const value = ratios.length >= 3 ? ratios[Math.floor(ratios.length / 2)] : null;
  locationScaleCache.set(locations, { speed: speeds, value });
  return value;
};

const locationVelocity = (
  samples: TimedSample<OpenF1Location>[],
  index: number,
  speeds: CarTelemetrySample[],
  unitsPerMeter: number | null,
) => {
  const sample = samples[index];
  const previousSample = samples[Math.max(0, index - 1)];
  const nextSample = samples[Math.min(samples.length - 1, index + 1)];
  const previous =
    sample.timestampMs - previousSample.timestampMs <= TRACK_TIME_GAP_MS ? previousSample : sample;
  const next =
    nextSample.timestampMs - sample.timestampMs <= TRACK_TIME_GAP_MS ? nextSample : sample;
  const elapsedMs = next.timestampMs - previous.timestampMs;
  if (!sample || !previous || !next || elapsedMs <= 0) return { x: 0, y: 0 };
  const incoming = { x: sample.x - previous.x, y: sample.y - previous.y };
  const outgoing = { x: next.x - sample.x, y: next.y - sample.y };
  const incomingLength = Math.hypot(incoming.x, incoming.y);
  const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
  let x =
    incomingLength && outgoingLength
      ? incoming.x / incomingLength + outgoing.x / outgoingLength
      : incoming.x + outgoing.x;
  let y =
    incomingLength && outgoingLength
      ? incoming.y / incomingLength + outgoing.y / outgoingLength
      : incoming.y + outgoing.y;
  const length = Math.hypot(x, y);
  if (!length) return { x: 0, y: 0 };
  x /= length;
  y /= length;

  const measuredSpeed = speedAt(speeds, sample.timestampMs);
  const fallbackMagnitude = Math.hypot(next.x - previous.x, next.y - previous.y) / elapsedMs;
  let magnitude =
    measuredSpeed !== null && unitsPerMeter !== null
      ? (Math.max(0, measuredSpeed) * unitsPerMeter) / 3_600
      : fallbackMagnitude;
  const adjacentLimits = [
    index > 0
      ? (2 * Math.hypot(sample.x - previous.x, sample.y - previous.y)) /
        (sample.timestampMs - previous.timestampMs)
      : Number.POSITIVE_INFINITY,
    index + 1 < samples.length
      ? (2 * Math.hypot(next.x - sample.x, next.y - sample.y)) /
        (next.timestampMs - sample.timestampMs)
      : Number.POSITIVE_INFINITY,
  ].filter((value) => Number.isFinite(value) && value >= 0);
  if (adjacentLimits.length) magnitude = Math.min(magnitude, ...adjacentLimits);
  return { x: x * magnitude, y: y * magnitude };
};

const interpolateRawLocationMotion = (
  samples: TimedSample<OpenF1Location>[],
  timestampMs: number,
  speeds: CarTelemetrySample[] = [],
) => {
  if (!samples.length || !Number.isFinite(timestampMs) || timestampMs < samples[0].timestampMs) {
    return null;
  }
  const last = samples[samples.length - 1];
  if (timestampMs >= last.timestampMs) {
    if (timestampMs - last.timestampMs > TRACK_TIME_GAP_MS) return null;
    const previous = samples[samples.length - 2];
    const elapsedMs = previous ? last.timestampMs - previous.timestampMs : 0;
    return {
      location: last,
      direction:
        timestampMs === last.timestampMs && previous && elapsedMs > 0
          ? {
              x: (last.x - previous.x) / elapsedMs,
              y: (last.y - previous.y) / elapsedMs,
              z: (last.z - previous.z) / elapsedMs,
            }
          : { x: 0, y: 0, z: 0 },
    };
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
  if (timestampMs === left.timestampMs || left.timestampMs === right.timestampMs) {
    const unitsPerMeter = speeds.length ? coordinateUnitsPerMeter(samples, speeds) : null;
    const velocity = locationVelocity(samples, leftIndex, speeds, unitsPerMeter);
    return { location: left, direction: { ...velocity, z: 0 } };
  }
  if (right.timestampMs - left.timestampMs > TRACK_TIME_GAP_MS) {
    return timestampMs - left.timestampMs <= TRACK_TIME_GAP_MS
      ? { location: left, direction: { x: 0, y: 0, z: 0 } }
      : null;
  }
  const ratio = (timestampMs - left.timestampMs) / (right.timestampMs - left.timestampMs);
  const elapsedMs = right.timestampMs - left.timestampMs;
  const unitsPerMeter = speeds.length ? coordinateUnitsPerMeter(samples, speeds) : null;
  let leftVelocity = locationVelocity(samples, leftIndex, speeds, unitsPerMeter);
  let rightVelocity = locationVelocity(samples, rightIndex, speeds, unitsPerMeter);
  const chord = { x: right.x - left.x, y: right.y - left.y };
  if (leftVelocity.x * chord.x + leftVelocity.y * chord.y < 0) {
    leftVelocity = { x: 0, y: 0 };
  }
  if (rightVelocity.x * chord.x + rightVelocity.y * chord.y < 0) {
    rightVelocity = { x: 0, y: 0 };
  }
  const ratio2 = ratio * ratio;
  const ratio3 = ratio2 * ratio;
  const h00 = 2 * ratio3 - 3 * ratio2 + 1;
  const h10 = ratio3 - 2 * ratio2 + ratio;
  const h01 = -2 * ratio3 + 3 * ratio2;
  const h11 = ratio3 - ratio2;
  const dh00 = 6 * ratio2 - 6 * ratio;
  const dh10 = 3 * ratio2 - 4 * ratio + 1;
  const dh01 = -dh00;
  const dh11 = 3 * ratio2 - 2 * ratio;
  return {
    location: {
      ...left,
      x:
        h00 * left.x +
        h10 * elapsedMs * leftVelocity.x +
        h01 * right.x +
        h11 * elapsedMs * rightVelocity.x,
      y:
        h00 * left.y +
        h10 * elapsedMs * leftVelocity.y +
        h01 * right.y +
        h11 * elapsedMs * rightVelocity.y,
      z: left.z + (right.z - left.z) * ratio,
      timestampMs,
    },
    direction: {
      x:
        (dh00 * left.x +
          dh10 * elapsedMs * leftVelocity.x +
          dh01 * right.x +
          dh11 * elapsedMs * rightVelocity.x) /
        elapsedMs,
      y:
        (dh00 * left.y +
          dh10 * elapsedMs * leftVelocity.y +
          dh01 * right.y +
          dh11 * elapsedMs * rightVelocity.y) /
        elapsedMs,
      z: (right.z - left.z) / elapsedMs,
    },
  };
};

const MOTION_SMOOTHING_MS = 100;

export const interpolateLocationMotion = (
  samples: TimedSample<OpenF1Location>[],
  timestampMs: number,
  speeds: CarTelemetrySample[] = [],
) => {
  const current = interpolateRawLocationMotion(samples, timestampMs, speeds);
  if (!current) return null;
  const before = interpolateRawLocationMotion(samples, timestampMs - MOTION_SMOOTHING_MS, speeds);
  const after = interpolateRawLocationMotion(samples, timestampMs + MOTION_SMOOTHING_MS, speeds);
  if (!before || !after) return current;
  return {
    location: {
      ...current.location,
      x: before.location.x * 0.25 + current.location.x * 0.5 + after.location.x * 0.25,
      y: before.location.y * 0.25 + current.location.y * 0.5 + after.location.y * 0.25,
      z: before.location.z * 0.25 + current.location.z * 0.5 + after.location.z * 0.25,
    },
    direction: {
      x: before.direction.x * 0.25 + current.direction.x * 0.5 + after.direction.x * 0.25,
      y: before.direction.y * 0.25 + current.direction.y * 0.5 + after.direction.y * 0.25,
      z: before.direction.z * 0.25 + current.direction.z * 0.5 + after.direction.z * 0.25,
    },
  };
};

export const interpolateLocation = (samples: TimedSample<OpenF1Location>[], timestampMs: number) =>
  interpolateRawLocationMotion(samples, timestampMs)?.location ?? null;

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
  const scale = 1 / Math.max(rangeX, rangeY);
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
