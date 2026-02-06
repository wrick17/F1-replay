import { Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ControlsBar } from "../components/ControlsBar";
import { MarkerLegend } from "../components/MarkerLegend";
import { SessionPicker } from "../components/SessionPicker";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { TrackView } from "../components/TrackView";
import { WeatherBadge } from "../components/WeatherBadge";
import { useReplayController } from "../hooks/useReplayController";
import { useReplayData } from "../hooks/useReplayData";
import { useSessionAutoCorrect, useSessionState } from "../hooks/useSessionSelector";
import { useTeamRadio } from "../hooks/useTeamRadio";
import { useTrackComputation } from "../hooks/useTrackComputation";
import { buildTimelineEvents, getActiveOvertakes } from "../services/events.service";
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

  const timelineEvents = useMemo(() => {
    if (!data) return [];
    return buildTimelineEvents(data, data.drivers);
  }, [data]);

  const currentWeather = useMemo(() => {
    if (!data) return null;
    return getWeatherAtTime(data.weather, replay.currentTimeMs);
  }, [data, replay.currentTimeMs]);

  const activeOvertakes = useMemo(() => {
    if (!data) return [];
    return getActiveOvertakes(data.overtakes, replay.currentTimeMs);
  }, [data, replay.currentTimeMs]);

  const [radioEnabled, setRadioEnabled] = useState(true);
  const toggleRadio = useCallback(() => setRadioEnabled((prev) => !prev), []);

  const { isAudioPlaying, playRadio, stopRadio, pauseRadio, resumeRadio } = useTeamRadio();

  const handleMarkerClick = useCallback(
    (timestampMs: number) => {
      replay.seekTo(timestampMs);
      if (!replay.isPlaying) {
        replay.togglePlay();
      }
    },
    [replay],
  );

  const drivers = data?.drivers ?? [];

  return (
    <div className="relative min-h-screen w-full overflow-y-auto text-white md:h-screen md:w-screen md:overflow-hidden">
      <header className="relative z-10 mx-4 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/20 bg-white/5 px-4 py-3 backdrop-blur-xl md:absolute md:left-4 md:right-80 md:top-4 md:mx-0 md:mt-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">F1 Replay</h1>
          {loading && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300">
              <Loader2 size={14} className="animate-spin" />
              Loading telemetry data…
            </span>
          )}
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

      <div className="relative mx-4 mt-4 min-h-[260px] md:absolute md:inset-0 md:mx-0 md:mt-0 md:pb-56 md:pl-4 md:pr-80 md:pt-24">
        <TrackView
          trackPath={trackPath}
          driverStates={driverStates}
          driverNames={driverNames}
          selectedDrivers={[]}
          className="h-full w-full"
        />
      </div>

      <footer className="relative z-10 mx-4 mt-4 md:absolute md:bottom-4 md:left-4 md:right-80 md:mx-0 md:mt-0">
        <div className="mb-2">
          <MarkerLegend hasEvents={timelineEvents.length > 0} />
        </div>
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
          drivers={drivers}
          isRadioPlaying={isAudioPlaying}
          onTogglePlay={replay.togglePlay}
          onSpeedChange={replay.setSpeed}
          onSeek={replay.seekTo}
          onRadioToggle={toggleRadio}
          onPlayRadio={playRadio}
          onStopRadio={stopRadio}
          onPauseRadio={pauseRadio}
          onResumeRadio={resumeRadio}
          onMarkerClick={handleMarkerClick}
        />
      </footer>

      <aside className="relative z-10 mx-4 mt-4 mb-6 h-[60vh] min-h-[320px] md:absolute md:bottom-4 md:right-4 md:top-4 md:mx-0 md:mt-0 md:mb-0 md:h-auto md:min-h-0 md:w-72">
        <TelemetryPanel
          summary={telemetrySummary}
          rows={telemetryRows}
          activeOvertakes={activeOvertakes}
        />
      </aside>
    </div>
  );
};
