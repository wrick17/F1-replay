import { useMemo } from "react";
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataRevision triggers recomputation when mutated arrays change
  const driverStates = useMemo(() => {
    if (!data) {
      return {};
    }
    return computeDriverStates(data, currentTimeMs, normalization);
  }, [data, dataRevision, normalization, currentTimeMs]);

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
