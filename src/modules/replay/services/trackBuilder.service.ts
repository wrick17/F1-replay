import { TRACK_TIME_GAP_MS } from "../constants/replay.constants";
import pitLanes from "../data/pitLanes.json";
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
  const references = pitLanes as unknown as Record<
    string,
    {
      year: number;
      circuitKey: number;
      points: Array<[number, number]>;
      anchors: Array<[number, number]>;
    }
  >;
  const reference = Object.values(references)
    .filter(
      (item) => item.circuitKey === data.meeting.circuit_key && item.year <= data.meeting.year,
    )
    .sort((a, b) => b.year - a.year)
    .find(
      (item) =>
        geometry &&
        item.anchors.every(
          (anchor) =>
            projectToTrack(anchor, geometry.points).distance * normalization.scale < 0.015,
        ),
    );
  const pitLanePath = (geometry?.pitLane ?? reference?.points ?? []).map(([x, y]) =>
    rotateTrackPoint(
      {
        x: (x - normalization.offset.x) * normalization.scale,
        y: (y - normalization.offset.y) * normalization.scale,
        z: 0,
      },
      rotation,
    ),
  );
  return { normalization, rotation, trackPath, pitLanePath };
};

type XY = [number, number];
const projectToTrack = (point: XY, track: XY[]) => {
  let nearest: XY = track[0];
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < track.length; i++) {
    const a = track[i],
      b = track[(i + 1) % track.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const fraction = Math.max(
      0,
      Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
    const candidate: XY = [a[0] + fraction * dx, a[1] + fraction * dy];
    const d = Math.hypot(point[0] - candidate[0], point[1] - candidate[1]);
    if (d < distance) {
      distance = d;
      nearest = candidate;
    }
  }
  return { distance, point: nearest };
};

// Pit timestamps can mark the end of a traversal. Find the measured off-circuit segment
// around the event and require both ends to rejoin the circuit; never draw guessed shortcuts.
export const buildPitLaneGeometry = (data: ReplaySessionData): XY[] => {
  const track = buildTrackGeometry(data)?.points ?? [];
  if (track.length < 3) return [];
  const extent = 1 / normalizePositions(track.map(([x, y]) => ({ x, y, z: 0 }))).scale;
  const threshold = extent * 0.0025;
  // Early 2023 has no pit collection. Explicit pit-out laps still locate measured visits.
  const pitEvents = data.pits.length
    ? data.pits
    : Object.values(data.telemetryByDriver)
        .flatMap((telemetry) => telemetry.laps.filter((lap) => lap.is_pit_out_lap))
        .map((lap) => ({ ...lap, pit_duration: null, lane_duration: null }));
  for (const pit of [...pitEvents].sort(
    (a, b) =>
      (a.lane_duration ?? a.pit_duration ?? 999) - (b.lane_duration ?? b.pit_duration ?? 999),
  )) {
    if (!Number.isFinite(pit.timestampMs)) continue;
    const duration = pit.lane_duration ?? pit.pit_duration ?? 30;
    if (duration < 5 || duration > 120) continue;
    const locations = data.telemetryByDriver[pit.driver_number]?.locations ?? [];
    const start = lowerBound(locations, pit.timestampMs - (duration + 40) * 1000);
    const end = lowerBound(locations, pit.timestampMs + (duration + 40) * 1000);
    const points = locations.slice(start, end);
    if (points.length < 10) continue;
    const projections = points.map((point) => projectToTrack([point.x, point.y], track));
    let runStart = -1;
    for (let i = 0; i < points.length; i++) {
      if (projections[i].distance > threshold) {
        if (runStart < 0) runStart = i;
        continue;
      }
      if (runStart < 0) continue;
      const begin = Math.max(0, runStart - 1);
      const segment = points.slice(begin, i + 1);
      const elapsed = points[i].timestampMs - points[begin].timestampMs;
      const nearEvent =
        points[i].timestampMs >= pit.timestampMs - duration * 1000 - 10000 &&
        points[begin].timestampMs <= pit.timestampMs + 10000;
      const stoppedMs = segment.reduce((total, point, index) => {
        if (!index) return total;
        const previous = segment[index - 1];
        const gap = point.timestampMs - previous.timestampMs;
        return (
          total +
          (gap > 0 &&
          gap <= TRACK_TIME_GAP_MS &&
          Math.hypot(point.x - previous.x, point.y - previous.y) / gap < extent * 0.000002
            ? gap
            : 0)
        );
      }, 0);
      const valid =
        stoppedMs >= 500 &&
        runStart > 0 &&
        segment.length >= 10 &&
        elapsed >= 5000 &&
        elapsed <= 150000 &&
        nearEvent &&
        segment.every(
          (point, index) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            (!index ||
              (point.timestampMs - segment[index - 1].timestampMs <= TRACK_TIME_GAP_MS &&
                Math.hypot(point.x - segment[index - 1].x, point.y - segment[index - 1].y) <
                  extent * 0.06)),
        );
      runStart = -1;
      if (!valid) continue;
      const result: XY[] = [projections[begin].point];
      // Drop near-identical stopped samples, retaining measured corners and the exact rejoin.
      for (const point of segment) {
        const last = result[result.length - 1];
        if (Math.hypot(point.x - last[0], point.y - last[1]) >= extent * 0.001)
          result.push([point.x, point.y]);
      }
      result.push(projections[i].point);
      if (result.length >= 8) return result;
    }
  }
  return [];
};
