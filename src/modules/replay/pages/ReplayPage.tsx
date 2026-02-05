import { useEffect, useMemo, useRef, useState } from "react";
import { ControlsBar } from "../components/ControlsBar";
import { SessionPicker } from "../components/SessionPicker";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { TrackView } from "../components/TrackView";
import { useReplayController } from "../hooks/useReplayController";
import { useReplayData } from "../hooks/useReplayData";
import type { OpenF1Driver } from "../types/openf1.types";
import {
  getCurrentLap,
  getCurrentPosition,
  getCurrentStint,
  interpolateLocation,
  normalizePositions,
} from "../utils/telemetry.util";

const getDefaultYear = () => new Date().getFullYear() - 1;

const formatTrackLabel = (driver: OpenF1Driver) => {
  return driver.name_acronym || driver.full_name;
};

const formatTelemetryLabel = (driver: OpenF1Driver) => {
  return driver.broadcast_name || driver.full_name;
};

const ALLOWED_SESSION_TYPES = ["Race", "Sprint", "Qualifying"] as const;
const TRACK_TIME_GAP_MS = 2000;

export const ReplayPage = () => {
  const [year, setYear] = useState(getDefaultYear());
  const [round, setRound] = useState(1);
  const [sessionType, setSessionType] = useState<"Race" | "Sprint" | "Qualifying">(
    "Race",
  );
  const selectedDrivers: number[] = [];
  const [useLiveData, setUseLiveData] = useState(false);
  const manualRoundRef = useRef(false);
  const trackBaseRef = useRef<{
    sessionKey: number | null;
    driverNumber: number | null;
    sampleCount: number;
    positions: { x: number; y: number; z: number; timestampMs: number }[];
  }>({ sessionKey: null, driverNumber: null, sampleCount: 0, positions: [] });

  const { data, loading, error, meetings, sessions, availableEndMs, dataRevision } =
    useReplayData({ year, round, sessionType, useLiveData });

  const sessionStartMs = data?.sessionStartMs ?? 0;
  const sessionEndMs = data?.sessionEndMs ?? 0;
  const effectiveEndMs =
    availableEndMs > sessionStartMs
      ? availableEndMs
      : Math.max(sessionEndMs, sessionStartMs);
  const hasSupportedSession = useMemo(() => {
    return sessions.some((session) =>
      ALLOWED_SESSION_TYPES.includes(
        session.session_type as (typeof ALLOWED_SESSION_TYPES)[number],
      ),
    );
  }, [sessions]);
  const hasSelectedSession = useMemo(() => {
    return sessions.some((session) => session.session_type === sessionType);
  }, [sessions, sessionType]);
  const canPlay =
    Boolean(data) &&
    effectiveEndMs > sessionStartMs &&
    availableEndMs > sessionStartMs;

  const replay = useReplayController({
    startTimeMs: sessionStartMs,
    endTimeMs: effectiveEndMs,
    availableEndMs: availableEndMs || sessionStartMs,
  });

  const referencePositions = useMemo(() => {
    if (!data?.drivers.length) {
      return [];
    }
    const sessionKey = data.session.session_key;
    const cached = trackBaseRef.current;
    let bestPositions: { x: number; y: number; z: number; timestampMs: number }[] =
      cached.sessionKey === sessionKey ? cached.positions : [];
    let bestCount =
      cached.sessionKey === sessionKey ? cached.sampleCount : 0;
    let bestDriver =
      cached.sessionKey === sessionKey ? cached.driverNumber : null;

    for (const driver of data.drivers) {
      const telemetry = data.telemetryByDriver[driver.driver_number];
      if (!telemetry?.locations?.length) {
        continue;
      }
      const sorted = [...telemetry.locations].sort(
        (a, b) => a.timestampMs - b.timestampMs,
      );
      const laps = telemetry.laps ?? [];
      let positions = sorted;
      let sampleCount = sorted.length;

      if (laps.length >= 2) {
        let bestStart = 0;
        let bestEnd = 0;
        let lapBestCount = 0;
        let cursor = 0;
        for (let i = 0; i < laps.length; i += 1) {
          const lapStart = laps[i]?.timestampMs ?? 0;
          const lapEnd =
            laps[i + 1]?.timestampMs ?? data.sessionEndMs ?? lapStart;
          if (lapEnd <= lapStart) {
            continue;
          }
          while (cursor < sorted.length && sorted[cursor].timestampMs < lapStart) {
            cursor += 1;
          }
          let endIndex = cursor;
          while (endIndex < sorted.length && sorted[endIndex].timestampMs < lapEnd) {
            endIndex += 1;
          }
          const count = endIndex - cursor;
          if (count > lapBestCount) {
            lapBestCount = count;
            bestStart = cursor;
            bestEnd = endIndex;
          }
          cursor = endIndex;
          if (cursor >= sorted.length) {
            break;
          }
        }
        if (lapBestCount > 0) {
          positions = sorted.slice(bestStart, bestEnd);
          sampleCount = lapBestCount;
        }
      }

      if (sampleCount > bestCount) {
        bestCount = sampleCount;
        bestPositions = positions;
        bestDriver = driver.driver_number;
      }
    }

    if (bestPositions.length > 0) {
      trackBaseRef.current = {
        sessionKey,
        driverNumber: bestDriver,
        sampleCount: bestCount,
        positions: bestPositions,
      };
    }

    return bestPositions;
  }, [data, dataRevision]);

  const normalization = useMemo(() => {
    const positions = referencePositions.map((sample) => ({
      x: sample.x,
      y: sample.y,
      z: sample.z,
    }));
    return normalizePositions(positions);
  }, [referencePositions, dataRevision]);

  const driverStates = useMemo(() => {
    if (!data) {
      return {};
    }
    const map: Record<number, { position: { x: number; y: number; z: number } | null; color: string }> = {};
    data.drivers.forEach((driver) => {
      const telemetry = data.telemetryByDriver[driver.driver_number];
      const locationSample = interpolateLocation(
        telemetry?.locations ?? [],
        replay.currentTimeMs,
      );
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
          color: `#${driver.team_colour}`,
        };
      } else {
        map[driver.driver_number] = {
          position: null,
          color: `#${driver.team_colour}`,
        };
      }
    });
    return map;
  }, [data, dataRevision, normalization.offset, normalization.scale, replay.currentTimeMs]);

  const trackPath = useMemo(() => {
    if (!referencePositions.length) {
      return [];
    }
    const points: { x: number; y: number; z: number }[] = [];
    let lastTimestamp: number | null = null;
    referencePositions.forEach((sample) => {
      if (
        !Number.isFinite(sample.x) ||
        !Number.isFinite(sample.y) ||
        !Number.isFinite(sample.z)
      ) {
        lastTimestamp = null;
        return;
      }
      if (
        lastTimestamp !== null &&
        sample.timestampMs - lastTimestamp > TRACK_TIME_GAP_MS
      ) {
        points.push({ x: Number.NaN, y: Number.NaN, z: Number.NaN });
      }
      points.push({
        x: (sample.x - normalization.offset.x) * normalization.scale,
        y: (sample.y - normalization.offset.y) * normalization.scale,
        z: (sample.z - normalization.offset.z) * normalization.scale,
      });
      lastTimestamp = sample.timestampMs;
    });
    return points;
  }, [normalization.offset, normalization.scale, referencePositions]);
  const driverNames = useMemo(() => {
    if (!data) {
      return {};
    }
    return data.drivers.reduce<Record<number, string>>((acc, driver) => {
      acc[driver.driver_number] = formatTrackLabel(driver);
      return acc;
    }, {});
  }, [data]);

  useEffect(() => {
    if (sessions.length === 0 || hasSelectedSession) {
      return;
    }
    const fallback = sessions.find((session) =>
      ALLOWED_SESSION_TYPES.includes(
        session.session_type as (typeof ALLOWED_SESSION_TYPES)[number],
      ),
    );
    if (fallback) {
      setSessionType(fallback.session_type as typeof sessionType);
    }
  }, [sessions, hasSelectedSession, sessionType]);

  useEffect(() => {
    if (manualRoundRef.current) {
      return;
    }
    if (sessions.length === 0 || hasSupportedSession) {
      return;
    }
    if (round < meetings.length) {
      setRound((prev) => Math.min(prev + 1, meetings.length));
    }
  }, [sessions, hasSupportedSession, meetings.length, round]);

  const telemetrySummary = useMemo(() => {
    if (!data) {
      return {
        sessionLabel: "No session loaded",
        coverageLabel: "--",
        totalDrivers: 0,
        totalSamples: 0,
      };
    }
    const sessionLabel = `${data.session.session_name} · ${data.session.session_type}`;
    const coverageLabel = `${Math.max(
      0,
      Math.floor((availableEndMs - sessionStartMs) / 60000),
    )} / ${Math.max(
      1,
      Math.floor((effectiveEndMs - sessionStartMs) / 60000),
    )} min`;
      return {
        sessionLabel,
        coverageLabel,
        totalDrivers: data.drivers.length,
      };
  }, [data, availableEndMs, effectiveEndMs, sessionStartMs]);

  const telemetryRows = useMemo(() => {
    if (!data) {
      return [];
    }
    const telemetryTimeMs = useLiveData
      ? Math.max(availableEndMs, sessionStartMs)
      : replay.currentTimeMs;
    return data.drivers
      .map((driver) => {
        const telemetry = data.telemetryByDriver[driver.driver_number];
        const positions = telemetry?.positions ?? [];
        const laps = telemetry?.laps ?? [];
        const latestPosition = positions[positions.length - 1];
        const latestLap = laps[laps.length - 1];
        const positionSample =
          latestPosition ?? getCurrentPosition(positions, telemetryTimeMs);
        const lapNumber =
          latestLap?.lap_number ?? getCurrentLap(laps, telemetryTimeMs);
        const stint = getCurrentStint(telemetry?.stints ?? [], lapNumber);
        return {
          driverNumber: driver.driver_number,
          driverName: formatTelemetryLabel(driver),
          driverAcronym: driver.name_acronym,
          position: positionSample?.position ?? null,
          lap: lapNumber,
          compound: stint?.compound ?? null,
        };
      })
      .sort((a, b) => {
        if (a.position === null) return 1;
        if (b.position === null) return -1;
        return a.position - b.position;
      });
  }, [data, replay.currentTimeMs, useLiveData, availableEndMs, sessionStartMs]);

  return (
    <div className="relative min-h-screen w-full overflow-y-auto bg-black text-white md:h-screen md:w-screen md:overflow-hidden">
      <header className="relative z-10 mx-4 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/20 bg-white/5 px-4 py-3 backdrop-blur-xl md:absolute md:left-4 md:right-4 md:top-4 md:mx-0 md:mt-0">
        <div>
          <h1 className="text-lg font-semibold">F1 Replay</h1>
          <p className="text-xs text-white/50">Live telemetry powered by OpenF1.</p>
        </div>
        <SessionPicker
          year={year}
          round={round}
          sessionType={sessionType}
          meetings={meetings}
          sessions={sessions}
          onYearChange={(nextYear) => {
            setYear(nextYear);
            setRound(1);
            manualRoundRef.current = false;
          }}
          onRoundChange={(nextRound) => {
            manualRoundRef.current = true;
            setRound(nextRound);
          }}
          onSessionTypeChange={setSessionType}
        />
      </header>

      <div className="relative z-10 mx-4 mt-3 flex max-w-[420px] flex-col gap-2 md:absolute md:left-4 md:top-24 md:mx-0 md:mt-0">
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
        {!hasSupportedSession && sessions.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            No supported session types (Race, Sprint, Qualifying) for this round.
            Choose another round.
          </div>
        )}
      </div>

      <div className="relative mx-4 mt-4 min-h-[260px] md:absolute md:inset-0 md:mx-0 md:mt-0 md:pb-16 md:pl-4 md:pr-72 md:pt-24">
        <TrackView
          trackPath={trackPath}
          driverStates={driverStates}
          driverNames={driverNames}
          selectedDrivers={selectedDrivers}
          className="h-full w-full"
        />
      </div>

      <footer className="relative z-10 mx-4 mt-4 md:absolute md:bottom-4 md:left-4 md:right-80 md:mx-0 md:mt-0">
        <ControlsBar
          isPlaying={replay.isPlaying}
          isBuffering={replay.isBuffering}
          isLive={useLiveData}
          speed={replay.speed}
          currentTimeMs={replay.currentTimeMs}
          startTimeMs={sessionStartMs}
          endTimeMs={effectiveEndMs}
          canPlay={canPlay}
          onTogglePlay={replay.togglePlay}
          onToggleLive={() => setUseLiveData((prev) => !prev)}
          onSpeedChange={replay.setSpeed}
          onSeek={replay.seekTo}
        />
      </footer>

      <aside className="relative z-10 mx-4 mt-4 mb-6 h-[60vh] min-h-[320px] md:absolute md:bottom-4 md:right-4 md:top-40 md:mx-0 md:mb-0 md:h-auto md:min-h-0 md:w-72">
        <TelemetryPanel summary={telemetrySummary} rows={telemetryRows} />
      </aside>

      {loading && (
        <div className="relative z-10 mx-4 mb-6 mt-2 text-xs text-white/40 md:absolute md:bottom-20 md:left-4 md:mx-0 md:mb-0 md:mt-0">
          Loading telemetry data...
        </div>
      )}
    </div>
  );
};
