import { useEffect, useMemo, useState } from "react";
import type { CircuitSurroundings } from "../types/circuitSurroundings.types";
import { validateCircuitSurroundings } from "../utils/circuitSurroundings.util";
import { matchReplayElevationProfile3D } from "../utils/replayElevation3d.util";
import type { NormalizedPosition } from "../utils/telemetry.util";
import { toTrackPoints3D } from "../utils/track3d.util";

export const useCircuitSurroundings = (
  circuitKey: number | undefined,
  trackPath: NormalizedPosition[],
) => {
  const [data, setData] = useState<CircuitSurroundings | null>(null);
  useEffect(() => {
    setData(null);
    if (!Number.isSafeInteger(circuitKey) || (circuitKey ?? 0) < 1) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    void (async () => {
      const response = await fetch(`/circuits/${circuitKey}.json`, { signal: controller.signal });
      if (!response.ok) return;
      const body = await response.text();
      if (body.length > 20_000_000) throw new Error("Circuit surroundings exceed size limit");
      const next = validateCircuitSurroundings(JSON.parse(body));
      if (!controller.signal.aborted && next.circuitKey === circuitKey) setData(next);
    })()
      .catch(() => {
        /* The recorded replay remains usable without a map. */
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [circuitKey]);
  return useMemo(
    () =>
      data !== null &&
      data.circuitKey === circuitKey &&
      matchReplayElevationProfile3D(toTrackPoints3D(trackPath), circuitKey, [
        { ...data, samples: [] },
      ])
        ? data
        : null,
    [data, circuitKey, trackPath],
  );
};
