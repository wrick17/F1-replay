import { useEffect, useMemo, useRef } from "react";
import { buildDriverNames, computeDriverStates } from "../services/driverState.service";
import { buildReferencePositions, buildTrackPath } from "../services/trackBuilder.service";
import type { ReplaySessionData } from "../types/openf1.types";
import type { DriverRenderState } from "../types/replay.types";
import type { NormalizedPosition } from "../utils/telemetry.util";
import { normalizePositions } from "../utils/telemetry.util";

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

  const driverStates = useMemo(() => {
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
    if (!Object.keys(driverStates).length) {
      prevStatesRef.current = {};
      lastTimeRef.current = null;
      return;
    }
    prevStatesRef.current = driverStates;
    lastTimeRef.current = currentTimeMs;
  }, [driverStates, currentTimeMs]);

  const trackPath = useMemo(() => {
    return buildTrackPath(referencePositions, normalization);
  }, [normalization, referencePositions]);

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
