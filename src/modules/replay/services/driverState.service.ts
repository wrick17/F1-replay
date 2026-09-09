import type { CarTelemetryPayload, CarTelemetrySample } from "../types/carTelemetry.types";
import type { OpenF1Driver, ReplaySessionData } from "../types/openf1.types";
import type { DriverRenderState, TeamBranding } from "../types/replay.types";
import { formatTrackLabel } from "../utils/format.util";
import { getTeamDisplayName, getTeamInitials, getTeamLogoUrl } from "../utils/teamBranding.util";
import {
  findSampleAtTime,
  getCurrentPosition,
  interpolateLocation,
  interpolateLocationMotion,
  speedWeightedProgress,
} from "../utils/telemetry.util";

const ESTIMATE_AFTER_GAP_MS = 10_000;
const MIN_LAP_MS = 30_000;
const MAX_LAP_MS = 5 * 60_000;

type Normalization = {
  scale: number;
  offset: { x: number; y: number; z: number };
};

type TrackMeasure = { segments: number[]; total: number };
type LapCalibration = { start: number; direction: 1 | -1 };

const trackMeasureCache = new WeakMap<Array<[number, number]>, TrackMeasure>();
const calibrationCache = new WeakMap<
  ReplaySessionData,
  { points: Array<[number, number]>; value: LapCalibration | null }
>();

const measureTrack = (points: Array<[number, number]>) => {
  const cached = trackMeasureCache.get(points);
  if (cached) return cached;
  const value = {
    segments: points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      return Math.hypot(next[0] - point[0], next[1] - point[1]);
    }),
    total: 0,
  };
  value.total = value.segments.reduce((sum, length) => sum + length, 0);
  trackMeasureCache.set(points, value);
  return value;
};

const pointAlongLap = (points: Array<[number, number]>, progress: number) => {
  const { segments, total } = measureTrack(points);
  let remaining = total * ((progress + 1) % 1);
  for (let index = 0; index < points.length; index += 1) {
    if (remaining > segments[index]) {
      remaining -= segments[index];
      continue;
    }
    const point = points[index];
    const next = points[(index + 1) % points.length];
    const ratio = segments[index] ? remaining / segments[index] : 0;
    return {
      x: point[0] + (next[0] - point[0]) * ratio,
      y: point[1] + (next[1] - point[1]) * ratio,
      z: 0,
    };
  }
  return null;
};

const projectOntoLap = (points: Array<[number, number]>, x: number, y: number) => {
  const { segments, total } = measureTrack(points);
  let distanceAlong = 0;
  let closest = { distance: Number.POSITIVE_INFINITY, progress: 0 };
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    const dx = next[0] - point[0];
    const dy = next[1] - point[1];
    const ratio = Math.max(
      0,
      Math.min(1, ((x - point[0]) * dx + (y - point[1]) * dy) / (segments[index] ** 2 || 1)),
    );
    const distance = Math.hypot(x - point[0] - dx * ratio, y - point[1] - dy * ratio);
    if (distance < closest.distance) {
      closest = { distance, progress: (distanceAlong + segments[index] * ratio) / total };
    }
    distanceAlong += segments[index];
  }
  return { ...closest, total };
};

const lapCalibration = (data: ReplaySessionData): LapCalibration | null => {
  const points = data.trackGeometry?.points ?? [];
  if (points.length < 3) return null;
  const cached = calibrationCache.get(data);
  if (cached?.points === points) return cached.value;

  let value: LapCalibration | null = null;
  for (const [driver, telemetry] of Object.entries(data.telemetryByDriver)) {
    const pitLaps = new Set(
      data.pits.filter((pit) => pit.driver_number === Number(driver)).map((pit) => pit.lap_number),
    );
    for (const lap of telemetry.laps) {
      if (lap.is_pit_out_lap || pitLaps.has(lap.lap_number)) continue;
      const start = interpolateLocation(telemetry.locations, lap.timestampMs);
      const after = interpolateLocation(telemetry.locations, lap.timestampMs + 5_000);
      if (!start || !after) continue;
      const startProjection = projectOntoLap(points, start.x, start.y);
      const afterProjection = projectOntoLap(points, after.x, after.y);
      if (
        startProjection.distance > startProjection.total * 0.02 ||
        afterProjection.distance > afterProjection.total * 0.02
      )
        continue;
      let advance = afterProjection.progress - startProjection.progress;
      if (advance > 0.5) advance -= 1;
      if (advance < -0.5) advance += 1;
      if (Math.abs(advance) < 0.002 || Math.abs(advance) > 0.25) continue;
      value = { start: startProjection.progress, direction: advance > 0 ? 1 : -1 };
      break;
    }
    if (value) break;
  }
  calibrationCache.set(data, { points, value });
  return value;
};

const estimateLapLocation = (
  data: ReplaySessionData,
  driverNumber: number,
  currentTimeMs: number,
  allowEstimate: boolean,
  speedSamples: CarTelemetrySample[],
) => {
  const telemetry = data.telemetryByDriver[driverNumber];
  const points = data.trackGeometry?.points ?? [];
  if (!allowEstimate || !telemetry || points.length < 3) return null;

  const previousLocation =
    telemetry.locations[0]?.timestampMs <= currentTimeMs
      ? findSampleAtTime(telemetry.locations, currentTimeMs)
      : null;
  const nextLocation =
    telemetry.locations[previousLocation ? telemetry.locations.indexOf(previousLocation) + 1 : 0];
  if (
    (previousLocation && currentTimeMs - previousLocation.timestampMs <= ESTIMATE_AFTER_GAP_MS) ||
    (nextLocation && nextLocation.timestampMs - currentTimeMs <= ESTIMATE_AFTER_GAP_MS)
  )
    return null;

  const lap = findSampleAtTime(telemetry.laps, currentTimeMs);
  const durationMs = (lap?.lap_duration ?? 0) * 1000;
  const calibration = lapCalibration(data);
  const isPitLap = data.pits.some(
    (pit) => pit.driver_number === driverNumber && pit.lap_number === lap?.lap_number,
  );
  if (
    !lap ||
    !calibration ||
    lap.is_pit_out_lap ||
    isPitLap ||
    durationMs < MIN_LAP_MS ||
    durationMs > MAX_LAP_MS ||
    currentTimeMs < lap.timestampMs ||
    currentTimeMs >= lap.timestampMs + durationMs
  )
    return null;
  const progress =
    speedWeightedProgress(
      speedSamples,
      lap.timestampMs,
      lap.timestampMs + durationMs,
      currentTimeMs,
    ) ?? (currentTimeMs - lap.timestampMs) / durationMs;
  return pointAlongLap(points, calibration.start + calibration.direction * progress);
};

const isRedFlagActive = (data: ReplaySessionData, currentTimeMs: number) => {
  for (let index = data.raceControl.length - 1; index >= 0; index -= 1) {
    const event = data.raceControl[index];
    if (event.timestampMs > currentTimeMs) continue;
    if (
      (event.scope === "Track" && ["RED", "GREEN", "CLEAR"].includes(event.flag ?? "")) ||
      /SESSION (?:RESUMED|STARTED)/i.test(event.message)
    )
      return event.flag === "RED";
  }
  return false;
};

export const computeDriverStates = (
  data: ReplaySessionData,
  currentTimeMs: number,
  normalization: Normalization,
  carTelemetry: CarTelemetryPayload | null = null,
): Record<number, DriverRenderState> => {
  const map: Record<number, DriverRenderState> = {};
  const allowEstimate = !isRedFlagActive(data, currentTimeMs);
  data.drivers.forEach((driver) => {
    const telemetry = data.telemetryByDriver[driver.driver_number];
    const locations = telemetry?.locations ?? [];
    const speedSamples = carTelemetry?.byDriver[driver.driver_number] ?? [];
    const liveMotion = interpolateLocationMotion(locations, currentTimeMs, speedSamples);
    const liveLocation = liveMotion?.location ?? null;
    const estimatedLocation = liveLocation
      ? null
      : estimateLapLocation(data, driver.driver_number, currentTimeMs, allowEstimate, speedSamples);
    // Hold only a measured past position. Never pull a car forward from a future sample.
    const previous =
      Number.isFinite(currentTimeMs) && locations[0]?.timestampMs <= currentTimeMs
        ? findSampleAtTime(locations, currentTimeMs)
        : null;
    const locationSample = liveLocation ?? estimatedLocation ?? previous;
    const earlierLocation = liveLocation
      ? null
      : estimatedLocation
        ? estimateLapLocation(
            data,
            driver.driver_number,
            currentTimeMs - 100,
            allowEstimate,
            speedSamples,
          )
        : null;
    const positionSample = getCurrentPosition(telemetry?.positions ?? [], currentTimeMs);
    const racePosition = positionSample?.position ?? null;
    if (
      locationSample &&
      Number.isFinite(locationSample.x) &&
      Number.isFinite(locationSample.y) &&
      Number.isFinite(locationSample.z)
    ) {
      map[driver.driver_number] = {
        position: {
          x: (locationSample.x - normalization.offset.x) * normalization.scale,
          y: (locationSample.y - normalization.offset.y) * normalization.scale,
          z: (locationSample.z - normalization.offset.z) * normalization.scale,
        },
        direction:
          liveMotion?.direction ??
          (earlierLocation
            ? {
                x: locationSample.x - earlierLocation.x,
                y: locationSample.y - earlierLocation.y,
                z: locationSample.z - earlierLocation.z,
              }
            : undefined),
        locationStatus: liveLocation ? "live" : estimatedLocation ? "estimated" : "stale",
        color: `#${driver.team_colour}`,
        racePosition,
      };
    } else {
      map[driver.driver_number] = {
        position: null,
        locationStatus: "unavailable",
        color: `#${driver.team_colour}`,
        racePosition,
      };
    }
  });
  return map;
};

export const buildDriverNames = (drivers: OpenF1Driver[]): Record<number, string> => {
  return drivers.reduce<Record<number, string>>((acc, driver) => {
    acc[driver.driver_number] = formatTrackLabel(driver);
    return acc;
  }, {});
};

export const buildDriverTeams = (drivers: OpenF1Driver[]): Record<number, TeamBranding> => {
  return drivers.reduce<Record<number, TeamBranding>>((acc, driver) => {
    const name = getTeamDisplayName(driver.team_name);
    acc[driver.driver_number] = {
      name,
      logoUrl: getTeamLogoUrl(name),
      initials: getTeamInitials(name),
    };
    return acc;
  }, {});
};
