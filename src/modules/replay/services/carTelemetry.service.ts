import type { CarTelemetryPayload, CarTelemetrySample } from "../types/carTelemetry.types";
import type { OpenF1CarData, TimedSample } from "../types/openf1.types";

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getBarColorClass = (percent: number) => {
  const p = clamp(percent, 0, 100);
  if (p >= 75) return "bg-red-500";
  if (p >= 50) return "bg-yellow-400";
  if (p >= 25) return "bg-green-400";
  return "bg-blue-400";
};

export const isDrsOn = (rawDrs: number) => rawDrs === 10 || rawDrs === 12 || rawDrs === 14;

export const normalizeBrakePercent = (rawBrake: number) => (rawBrake > 0 ? 100 : 0);

export const normalizeDrsPercent = (rawDrs: number) => (isDrsOn(rawDrs) ? 100 : 0);

export const isSpeedDanger = (speed: number) => speed > 200;

export const formatGear = (gear: number | null | undefined) => {
  if (gear === null || gear === undefined || !Number.isFinite(gear)) return "--";
  if (gear === 0) return "N";
  return String(Math.round(gear));
};

export const formatInt = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return String(Math.round(value));
};

export const toTimestampMs = (sample: { date: string }) => Date.parse(sample.date);

export const withTimestamp = <T extends { date: string }>(samples: T[]): TimedSample<T>[] => {
  return samples
    .map((sample) => ({ ...sample, timestampMs: toTimestampMs(sample) }))
    .filter((sample) => Number.isFinite(sample.timestampMs));
};

export type DownsampleState = {
  sessionKey: number;
  intervalMs: number;
  byDriver: Record<number, Map<number, CarTelemetryBucketSample>>;
  maxSpeed: number;
  maxRpm: number;
};

type CarTelemetryBucketSample = CarTelemetrySample & { sourceTimestampMs: number };

export const createDownsampleState = (sessionKey: number, intervalMs = 500): DownsampleState => ({
  sessionKey,
  intervalMs,
  byDriver: {},
  maxSpeed: 0,
  maxRpm: 0,
});

export const ingestCarDataChunk = (state: DownsampleState, chunk: OpenF1CarData[]) => {
  const timed = withTimestamp(chunk);
  for (const sample of timed) {
    const timestampMs = sample.timestampMs;
    const driverNumber = sample.driver_number;
    const bucket = Math.floor(timestampMs / state.intervalMs) * state.intervalMs;

    state.maxSpeed = Math.max(state.maxSpeed, sample.speed || 0);
    state.maxRpm = Math.max(state.maxRpm, sample.rpm || 0);

    let driverMap = state.byDriver[driverNumber];
    if (!driverMap) {
      driverMap = new Map<number, CarTelemetryBucketSample>();
      state.byDriver[driverNumber] = driverMap;
    }
    const existing = driverMap.get(bucket);
    if (!existing || existing.sourceTimestampMs <= timestampMs) {
      driverMap.set(bucket, {
        timestampMs: bucket,
        sourceTimestampMs: timestampMs,
        speed: sample.speed ?? 0,
        gear: sample.n_gear ?? 0,
        rpm: sample.rpm ?? 0,
        throttle: sample.throttle ?? 0,
        brake: sample.brake ?? 0,
        drs: sample.drs ?? 0,
      });
    }
  }
};

export const finalizeCarTelemetryPayload = (state: DownsampleState): CarTelemetryPayload => {
  const byDriver: Record<number, CarTelemetrySample[]> = {};
  Object.entries(state.byDriver).forEach(([driverKey, driverMap]) => {
    const driverNumber = Number(driverKey);
    const samples = Array.from(driverMap.values())
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .map(({ sourceTimestampMs: _ignored, ...rest }) => rest);
    byDriver[driverNumber] = samples;
  });
  return {
    sessionKey: state.sessionKey,
    sampleIntervalMs: 500,
    createdAt: new Date().toISOString(),
    byDriver,
  };
};

export type CarTelemetrySessionStats = {
  speedMaxSession: number;
  rpmMaxSession: number;
};

export const computeSessionStats = (payload: CarTelemetryPayload): CarTelemetrySessionStats => {
  let maxSpeed = 0;
  let maxRpm = 0;
  Object.values(payload.byDriver).forEach((samples) => {
    for (const s of samples) {
      maxSpeed = Math.max(maxSpeed, s.speed || 0);
      maxRpm = Math.max(maxRpm, s.rpm || 0);
    }
  });
  const speedMaxSession = clamp(maxSpeed, 250, 380);
  const rpmMaxSession = Math.min(15000, Math.max(1, maxRpm));
  return { speedMaxSession, rpmMaxSession };
};

export const findNearestSample = (samples: CarTelemetrySample[], timestampMs: number) => {
  if (!samples.length) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (samples[mid].timestampMs < timestampMs) lo = mid + 1;
    else hi = mid;
  }
  const after = samples[lo] ?? null;
  const before = lo > 0 ? samples[lo - 1] : null;
  if (!before) return after;
  if (!after) return before;
  return Math.abs(after.timestampMs - timestampMs) < Math.abs(timestampMs - before.timestampMs)
    ? after
    : before;
};
