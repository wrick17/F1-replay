import { useEffect, useMemo, useRef } from "react";
import { buildDriverNames, computeDriverStates } from "../services/driverState.service";
import { buildReferencePositions, buildTrackPath } from "../services/trackBuilder.service";
import type { ReplaySessionData } from "../types/openf1.types";
import type { DriverRenderState } from "../types/replay.types";
import type { NormalizedPosition } from "../utils/telemetry.util";
import { normalizePositions } from "../utils/telemetry.util";

const ROTATION_STEP_DEG = 5;
const TARGET_ASPECT_RATIO = 1.6;
const ROTATION_IMPROVEMENT_THRESHOLD = 1.08;

const rotatePoint = (point: NormalizedPosition, cos: number, sin: number): NormalizedPosition => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return point;
  }
  return {
    ...point,
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
};

const computeRotationScore = (points: NormalizedPosition[], angleRad: number) => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }
    const rotatedX = point.x * cos - point.y * sin;
    const rotatedY = point.x * sin + point.y * cos;
    minX = Math.min(minX, rotatedX);
    maxX = Math.max(maxX, rotatedX);
    minY = Math.min(minY, rotatedY);
    maxY = Math.max(maxY, rotatedY);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 0;
  }
  return Math.min(TARGET_ASPECT_RATIO / width, 1 / height);
};

const resolveRotationAngle = (points: NormalizedPosition[]) => {
  if (points.length < 2) {
    return 0;
  }
  const baseScore = computeRotationScore(points, 0);
  let bestScore = baseScore;
  let bestAngle = 0;
  for (let deg = -90; deg <= 90; deg += ROTATION_STEP_DEG) {
    const angleRad = (deg * Math.PI) / 180;
    const score = computeRotationScore(points, angleRad);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angleRad;
    }
  }
  if (bestScore > baseScore * ROTATION_IMPROVEMENT_THRESHOLD) {
    return bestAngle;
  }
  return 0;
};

const rotatePositions = (points: NormalizedPosition[], angleRad: number) => {
  if (angleRad === 0) {
    return points;
  }
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return points.map((point) => rotatePoint(point, cos, sin));
};

const rotateDriverStates = (states: Record<number, DriverRenderState>, angleRad: number) => {
  if (angleRad === 0) {
    return states;
  }
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const result: Record<number, DriverRenderState> = {};
  Object.entries(states).forEach(([key, state]) => {
    if (!state.position) {
      result[Number(key)] = state;
      return;
    }
    result[Number(key)] = {
      ...state,
      position: rotatePoint(state.position, cos, sin),
    };
  });
  return result;
};

type UseTrackComputationParams = {
  data: ReplaySessionData | null;
  dataRevision: number;
  currentTimeMs: number;
};

type UseTrackComputationResult = {
  trackPath: NormalizedPosition[];
  driverStates: Record<number, DriverRenderState>;
  driverNames: Record<number, string>;
};

export const useTrackComputation = ({
  data,
  dataRevision,
  currentTimeMs,
}: UseTrackComputationParams): UseTrackComputationResult => {
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataRevision triggers recomputation when mutated arrays change
  const referencePositions = useMemo(() => {
    if (!data?.drivers.length) {
      return [];
    }
    return buildReferencePositions(data);
  }, [data, dataRevision]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataRevision triggers recomputation when mutated arrays change
  const normalization = useMemo(() => {
    const positions = referencePositions.map((sample) => ({
      x: sample.x,
      y: sample.y,
      z: sample.z,
    }));
    return normalizePositions(positions);
  }, [referencePositions, dataRevision]);

  const prevStatesRef = useRef<Record<number, DriverRenderState>>({});
  const lastTimeRef = useRef<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataRevision triggers recomputation when mutated arrays change
  const rawDriverStates = useMemo(() => {
    if (!data) {
      return {};
    }
    return computeDriverStates(data, currentTimeMs, normalization);
  }, [data, dataRevision, normalization, currentTimeMs]);

  const smoothedDriverStates = useMemo(() => {
    const entries = Object.entries(rawDriverStates);
    if (entries.length === 0) {
      return {};
    }

    const lastTime = lastTimeRef.current;
    const delta = lastTime === null ? null : Math.abs(currentTimeMs - lastTime);
    const shouldReset = delta === null || delta > 2500;
    const smoothFactor = 0.22;

    const result: Record<number, DriverRenderState> = {};
    for (const [key, state] of entries) {
      const driverNumber = Number(key);
      if (!state.position) {
        result[driverNumber] = state;
        continue;
      }
      const prev = prevStatesRef.current[driverNumber];
      if (shouldReset || !prev?.position) {
        result[driverNumber] = state;
        continue;
      }
      result[driverNumber] = {
        ...state,
        position: {
          x: prev.position.x + (state.position.x - prev.position.x) * smoothFactor,
          y: prev.position.y + (state.position.y - prev.position.y) * smoothFactor,
          z: prev.position.z + (state.position.z - prev.position.z) * smoothFactor,
        },
      };
    }
    return result;
  }, [rawDriverStates, currentTimeMs]);

  useEffect(() => {
    if (!Object.keys(smoothedDriverStates).length) {
      prevStatesRef.current = {};
      lastTimeRef.current = null;
      return;
    }
    prevStatesRef.current = smoothedDriverStates;
    lastTimeRef.current = currentTimeMs;
  }, [smoothedDriverStates, currentTimeMs]);

  const rawTrackPath = useMemo(() => {
    return buildTrackPath(referencePositions, normalization);
  }, [normalization, referencePositions]);

  const rotationAngle = useMemo(() => resolveRotationAngle(rawTrackPath), [rawTrackPath]);

  const trackPath = useMemo(
    () => rotatePositions(rawTrackPath, rotationAngle),
    [rawTrackPath, rotationAngle],
  );

  const driverStates = useMemo(
    () => rotateDriverStates(smoothedDriverStates, rotationAngle),
    [smoothedDriverStates, rotationAngle],
  );

  const driverNames = useMemo(() => {
    if (!data) {
      return {};
    }
    return buildDriverNames(data.drivers);
  }, [data]);

  return {
    trackPath,
    driverStates,
    driverNames,
  };
};
