import { useEffect, useMemo, useState } from "react";
import {
  buildDriverNames,
  buildDriverTeams,
  computeDriverStates,
} from "../services/driverState.service";
import { buildTrack, rotateTrackPoint } from "../services/trackBuilder.service";
import type { ReplaySessionData } from "../types/openf1.types";
import type { DriverRenderState } from "../types/replay.types";

export const useTrackComputation = ({
  data,
  dataRevision,
  currentTimeMs,
}: {
  data: ReplaySessionData | null;
  dataRevision: number;
  currentTimeMs: number;
}) => {
  const sessionKey = data?.session.session_key;
  const [fallback, setFallback] = useState<{
    sessionKey: number;
    track: ReturnType<typeof buildTrack>;
  } | null>(null);
  // Archived geometry is shared by all location windows for this session.
  // biome-ignore lint/correctness/useExhaustiveDependencies: track generation reads only supplied geometry when present
  const canonical = useMemo(
    () => (data?.trackGeometry ? buildTrack(data) : null),
    [data?.trackGeometry, sessionKey],
  );
  // Legacy archives can acquire a complete lap later. Keep the first valid circuit once found.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revisions support existing mutated telemetry consumers
  useEffect(() => {
    if (!data || data.trackGeometry || fallback?.sessionKey === sessionKey) return;
    const computed = buildTrack(data);
    if (computed.trackPath.length)
      setFallback({ sessionKey: data.session.session_key, track: computed });
  }, [data, dataRevision, fallback, sessionKey]);
  const track =
    canonical ?? (fallback && fallback.sessionKey === sessionKey ? fallback.track : null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revisions support existing mutated telemetry consumers
  const driverStates = useMemo((): Record<number, DriverRenderState> => {
    if (!data || !track?.trackPath.length) return {};
    const states = computeDriverStates(data, currentTimeMs, track.normalization);
    for (const state of Object.values(states)) {
      if (state.position) state.position = rotateTrackPoint(state.position, track.rotation);
      if (state.direction) state.direction = rotateTrackPoint(state.direction, track.rotation);
    }
    return states;
  }, [data, dataRevision, currentTimeMs, track]);
  const driverNames = useMemo(() => buildDriverNames(data?.drivers ?? []), [data]);
  const driverFullNames = useMemo(
    () =>
      Object.fromEntries(
        (data?.drivers ?? []).map((driver) => [driver.driver_number, driver.full_name]),
      ),
    [data],
  );
  const driverTeams = useMemo(() => buildDriverTeams(data?.drivers ?? []), [data]);
  return {
    trackPath: track?.trackPath ?? [],
    pitLanePath: track?.pitLanePath ?? [],
    driverStates,
    driverNames,
    driverFullNames,
    driverTeams,
  };
};
