import { TRACK_TIME_GAP_MS } from "../constants/replay.constants";
import type { ReplaySessionData, TrackGeometry } from "../types/openf1.types";
import { type NormalizedPosition, normalizePositions } from "../utils/telemetry.util";

type TimedPoint = NormalizedPosition & { timestampMs: number };

const lowerBound = (samples: TimedPoint[], timestamp: number) => {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (samples[mid].timestampMs < timestamp) low = mid + 1;
    else high = mid;
  }
  return low;
};

// A single complete lap preserves point order. Combining cars creates shortcuts and pit lanes.
export const buildReferencePositions = (data: ReplaySessionData): TimedPoint[] => {
  const pitLaps = new Set(data.pits.map((pit) => `${pit.driver_number}:${pit.lap_number}`));
  const candidates = Object.values(data.telemetryByDriver)
    .flatMap((telemetry) => telemetry.laps)
    .filter(
      (lap) =>
        !lap.is_pit_out_lap &&
        !pitLaps.has(`${lap.driver_number}:${lap.lap_number}`) &&
        Number.isFinite(lap.timestampMs) &&
        Number.isFinite(lap.lap_duration) &&
        lap.lap_duration > 0,
    )
    .sort(
      (a, b) =>
        a.lap_duration - b.lap_duration ||
        a.driver_number - b.driver_number ||
        a.lap_number - b.lap_number,
    );

  for (const lap of candidates) {
    const samples = data.telemetryByDriver[lap.driver_number]?.locations ?? [];
    const end = lap.timestampMs + lap.lap_duration * 1000;
    const startIndex = lowerBound(samples, lap.timestampMs);
    const endIndex = lowerBound(samples, end);
    const points = samples.slice(startIndex, endIndex);
    if (
      points.length < 20 ||
      points[0].timestampMs - lap.timestampMs > TRACK_TIME_GAP_MS ||
      end - points[points.length - 1].timestampMs > TRACK_TIME_GAP_MS
    )
      continue;
    if (
      points.some(
        (point, index) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          !Number.isFinite(point.timestampMs) ||
          (index > 0 &&
            (point.timestampMs <= points[index - 1].timestampMs ||
              point.timestampMs - points[index - 1].timestampMs > TRACK_TIME_GAP_MS)),
      )
    )
      continue;
    const distances = points
      .slice(1)
      .map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
    const orderedDistances = [...distances].sort((a, b) => a - b);
    const typicalStep = orderedDistances[Math.floor(orderedDistances.length / 2)];
    const length = distances.reduce((sum, distance) => sum + distance, 0);
    const closure = Math.hypot(
      points[0].x - points[points.length - 1].x,
      points[0].y - points[points.length - 1].y,
    );
    if (
      length <= 0 ||
      distances.some((distance) => distance > Math.max(typicalStep * 10, length * 0.025)) ||
      closure > Math.max(typicalStep * 4, length * 0.015)
    )
      continue;
    return points;
  }
  return [];
};

export const buildLapTrackGeometry = (data: ReplaySessionData): TrackGeometry | undefined => {
  const points = buildReferencePositions(data);
  if (!points.length) return undefined;
  return { points: points.map(({ x, y }) => [x, y]), rotation: 0, source: "lap" };
};

export const rotateTrackPoint = (
  point: NormalizedPosition,
  rotation: number,
): NormalizedPosition => {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
    z: point.z,
  };
};

export const buildTrackGeometry = (data: ReplaySessionData): TrackGeometry | undefined => {
  const supplied = data.trackGeometry;
  return supplied &&
    supplied.points.length >= 3 &&
    Number.isFinite(supplied.rotation) &&
    supplied.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    ? supplied
    : buildLapTrackGeometry(data);
};

export const buildTrack = (data: ReplaySessionData) => {
  const geometry = buildTrackGeometry(data);
  const normalization = normalizePositions(
    (geometry?.points ?? []).map(([x, y]) => ({ x, y, z: 0 })),
  );
  const rotation = geometry?.rotation ?? 0;
  const trackPath = normalization.normalized.map((point) => rotateTrackPoint(point, rotation));
  if (trackPath.length) trackPath.push(trackPath[0]);
  return { normalization, rotation, trackPath };
};
