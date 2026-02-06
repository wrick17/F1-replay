import { useCallback, useMemo, useState } from "react";
import { ControlsBar } from "../components/ControlsBar";
import { SessionPicker } from "../components/SessionPicker";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { TrackView } from "../components/TrackView";
import { WeatherBadge } from "../components/WeatherBadge";
import { useReplayController } from "../hooks/useReplayController";
import { useReplayData } from "../hooks/useReplayData";
import { useSessionAutoCorrect, useSessionState } from "../hooks/useSessionSelector";
import { useTeamRadio } from "../hooks/useTeamRadio";
import { useTrackComputation } from "../hooks/useTrackComputation";
import { buildTimelineEvents, getActiveOvertake } from "../services/events.service";
import { computeTelemetryRows, computeTelemetrySummary } from "../services/telemetry.service";
import { getWeatherAtTime } from "../services/weather.service";

export const ReplayPage = () => {
  const session = useSessionState();

  const { data, loading, error, meetings, sessions, availableYears, availableEndMs, dataRevision } =
    useReplayData({
      year: session.year,
      round: session.round,
      sessionType: session.sessionType,
    });

  const { hasSupportedSession } = useSessionAutoCorrect({
    meetings,
    sessions,
    availableYears,
    year: session.year,
    round: session.round,
    sessionType: session.sessionType,
    setYear: session.setYear,
    setRound: session.setRound,
    setSessionType: session.setSessionType,
    manualRoundRef: session.manualRoundRef,
  });

  const sessionStartMs = data?.sessionStartMs ?? 0;
  const sessionEndMs = data?.sessionEndMs ?? 0;
  const effectiveEndMs =
    availableEndMs > sessionStartMs ? availableEndMs : Math.max(sessionEndMs, sessionStartMs);
  const canPlay =
    Boolean(data) && effectiveEndMs > sessionStartMs && availableEndMs > sessionStartMs;

  const replay = useReplayController({
    startTimeMs: sessionStartMs,
    endTimeMs: effectiveEndMs,
    availableEndMs: availableEndMs || sessionStartMs,
  });

  const { trackPath, driverStates, driverNames } = useTrackComputation({
    data,
    dataRevision,
    currentTimeMs: replay.currentTimeMs,
  });

  const telemetrySummary = useMemo(
    () => computeTelemetrySummary(data, availableEndMs, effectiveEndMs, sessionStartMs),
    [data, availableEndMs, effectiveEndMs, sessionStartMs],
  );

  const telemetryRows = useMemo(
    () => computeTelemetryRows(data, replay.currentTimeMs),
    [data, replay.currentTimeMs],
  );

  // Timeline events
  const timelineEvents = useMemo(() => {
    if (!data) return [];
    return buildTimelineEvents(data, data.drivers);
  }, [data]);

  // Weather
  const currentWeather = useMemo(() => {
    if (!data) return null;
    return getWeatherAtTime(data.weather, replay.currentTimeMs);
  }, [data, replay.currentTimeMs]);

  // Overtake detection
  const activeOvertake = useMemo(() => {
    if (!data) return null;
    return getActiveOvertake(data.overtakes, replay.currentTimeMs);
  }, [data, replay.currentTimeMs]);

  // Team radio
  const [radioEnabled, setRadioEnabled] = useState(false);
  const toggleRadio = useCallback(() => setRadioEnabled((prev) => !prev), []);

  useTeamRadio({
    teamRadios: data?.teamRadios ?? [],
    currentTimeMs: replay.currentTimeMs,
    enabled: radioEnabled,
    isPlaying: replay.isPlaying,
  });

  return (
    <div className="relative min-h-screen w-full overflow-y-auto text-white md:h-screen md:w-screen md:overflow-hidden">
      <header className="relative z-10 mx-4 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/20 bg-white/5 px-4 py-3 backdrop-blur-xl md:absolute md:left-4 md:right-80 md:top-4 md:mx-0 md:mt-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">F1 Replay</h1>
          {loading && <span className="animate-pulse text-xs text-white/40">Loading...</span>}
        </div>
        <WeatherBadge weather={currentWeather} />
        <SessionPicker
          year={session.year}
          round={session.round}
          sessionType={session.sessionType}
          meetings={meetings}
          sessions={sessions}
          yearOptions={availableYears}
          onYearChange={(nextYear) => {
            session.setYear(nextYear);
            session.setRound(1);
            session.manualRoundRef.current = false;
          }}
          onRoundChange={(nextRound) => {
            session.manualRoundRef.current = true;
            session.setRound(nextRound);
          }}
          onSessionTypeChange={session.setSessionType}
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
            No supported session types (Race, Sprint, Qualifying) for this round. Choose another
            round.
          </div>
        )}
      </div>

      <div className="relative mx-4 mt-4 min-h-[260px] md:absolute md:inset-0 md:mx-0 md:mt-0 md:pb-16 md:pl-4 md:pr-72 md:pt-24">
        <TrackView
          trackPath={trackPath}
          driverStates={driverStates}
          driverNames={driverNames}
          selectedDrivers={[]}
          className="h-full w-full"
        />
      </div>

      <footer className="relative z-10 mx-4 mt-4 md:absolute md:bottom-4 md:left-4 md:right-80 md:mx-0 md:mt-0">
        <ControlsBar
          isPlaying={replay.isPlaying}
          isBuffering={replay.isBuffering}
          speed={replay.speed}
          currentTimeMs={replay.currentTimeMs}
          startTimeMs={sessionStartMs}
          endTimeMs={effectiveEndMs}
          canPlay={canPlay}
          timelineEvents={timelineEvents}
          radioEnabled={radioEnabled}
          onTogglePlay={replay.togglePlay}
          onSpeedChange={replay.setSpeed}
          onSeek={replay.seekTo}
          onRadioToggle={toggleRadio}
        />
      </footer>

      <aside className="relative z-10 mx-4 mt-4 mb-6 h-[60vh] min-h-[320px] md:absolute md:bottom-4 md:right-4 md:top-4 md:mx-0 md:mt-0 md:mb-0 md:h-auto md:min-h-0 md:w-72">
        <TelemetryPanel
          summary={telemetrySummary}
          rows={telemetryRows}
          activeOvertake={activeOvertake}
        />
      </aside>
    </div>
  );
};
