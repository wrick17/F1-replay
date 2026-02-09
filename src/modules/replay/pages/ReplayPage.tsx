import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ControlsBar } from "../components/ControlsBar";
import { MarkerLegend } from "../components/MarkerLegend";
import { SessionPicker } from "../components/SessionPicker";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { TrackView } from "../components/TrackView";
import { WeatherBadge } from "../components/WeatherBadge";
import { ALLOWED_SESSION_TYPES, SKIP_INTERVAL_LABELS } from "../constants/replay.constants";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useReplayController } from "../hooks/useReplayController";
import { useReplayData } from "../hooks/useReplayData";
import { useSessionAutoCorrect, useSessionState } from "../hooks/useSessionSelector";
import { useTeamRadio } from "../hooks/useTeamRadio";
import { useTrackComputation } from "../hooks/useTrackComputation";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { buildTimelineEvents, getActiveOvertakes } from "../services/events.service";
import { preloadRadioAudios } from "../services/radioAudio.service";
import { computeTelemetryRows, computeTelemetrySummary } from "../services/telemetry.service";
import { getWeatherAtTime } from "../services/weather.service";

export const ReplayPage = () => {
  const session = useSessionState();
  const prefs = useUserPreferences();

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

  // Sync persisted speed to replay controller
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when speed preference changes
  useEffect(() => {
    replay.setSpeed(prefs.speed);
  }, [prefs.speed]);

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

  const { isAudioPlaying, playRadio, stopRadio, pauseRadio, resumeRadio } = useTeamRadio();

  useEffect(() => {
    if (!data?.teamRadios?.length) {
      return;
    }
    void preloadRadioAudios(data.teamRadios);
  }, [data?.teamRadios]);

  const handleMarkerClick = useCallback(
    (timestampMs: number) => {
      replay.seekTo(timestampMs);
      if (!replay.isPlaying) {
        replay.togglePlay();
      }
    },
    [replay],
  );

  const handleSkipBack = useCallback(
    () => replay.seekTo(replay.currentTimeMs - prefs.skipIntervalMs),
    [replay, prefs.skipIntervalMs],
  );

  const handleSkipForward = useCallback(
    () => replay.seekTo(replay.currentTimeMs + prefs.skipIntervalMs),
    [replay, prefs.skipIntervalMs],
  );

  // Collapsible UI state (lightweight, not persisted)
  const [legendCollapsed, setLegendCollapsed] = useState(true);
  const [shortcutsCollapsed, setShortcutsCollapsed] = useState(true);

  const toggleLegendCollapsed = useCallback(() => setLegendCollapsed((prev) => !prev), []);
  const toggleShortcutsCollapsed = useCallback(() => setShortcutsCollapsed((prev) => !prev), []);

  const availableSessionTypes = useMemo(() => {
    const sessionSet = new Set(sessions.map((entry) => entry.session_type));
    return ALLOWED_SESSION_TYPES.filter((entry) => sessionSet.has(entry));
  }, [sessions]);

  const nextRound = useCallback(() => {
    if (!meetings.length) {
      return;
    }
    session.manualRoundRef.current = true;
    session.setRound((prev) => Math.min(prev + 1, meetings.length));
  }, [meetings.length, session]);

  const prevRound = useCallback(() => {
    if (!meetings.length) {
      return;
    }
    session.manualRoundRef.current = true;
    session.setRound((prev) => Math.max(prev - 1, 1));
  }, [meetings.length, session]);

  const nextYear = useCallback(() => {
    if (!availableYears.length) {
      return;
    }
    const sorted = [...availableYears].sort((a, b) => b - a);
    const index = sorted.indexOf(session.year);
    const nextIndex = Math.max(0, index - 1);
    session.setYear(sorted[nextIndex] ?? sorted[0]);
  }, [availableYears, session]);

  const prevYear = useCallback(() => {
    if (!availableYears.length) {
      return;
    }
    const sorted = [...availableYears].sort((a, b) => b - a);
    const index = sorted.indexOf(session.year);
    const nextIndex = Math.min(sorted.length - 1, index + 1);
    session.setYear(sorted[nextIndex] ?? sorted[sorted.length - 1]);
  }, [availableYears, session]);

  const nextSession = useCallback(() => {
    if (!availableSessionTypes.length) {
      return;
    }
    const currentIndex = ALLOWED_SESSION_TYPES.indexOf(session.sessionType);
    for (let i = 1; i <= ALLOWED_SESSION_TYPES.length; i += 1) {
      const nextType = ALLOWED_SESSION_TYPES[(currentIndex + i) % ALLOWED_SESSION_TYPES.length];
      if (availableSessionTypes.includes(nextType)) {
        session.setSessionType(nextType);
        return;
      }
    }
  }, [availableSessionTypes, session]);

  const prevSession = useCallback(() => {
    if (!availableSessionTypes.length) {
      return;
    }
    const currentIndex = ALLOWED_SESSION_TYPES.indexOf(session.sessionType);
    for (let i = 1; i <= ALLOWED_SESSION_TYPES.length; i += 1) {
      const nextType =
        ALLOWED_SESSION_TYPES[
          (currentIndex - i + ALLOWED_SESSION_TYPES.length) % ALLOWED_SESSION_TYPES.length
        ];
      if (availableSessionTypes.includes(nextType)) {
        session.setSessionType(nextType);
        return;
      }
    }
  }, [availableSessionTypes, session]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    togglePlay: replay.togglePlay,
    seekTo: replay.seekTo,
    currentTimeMs: replay.currentTimeMs,
    skipIntervalMs: prefs.skipIntervalMs,
    cycleSpeed: prefs.cycleSpeed,
    toggleRadio: prefs.toggleRadio,
    cycleSkipInterval: prefs.cycleSkipInterval,
    toggleTimelineExpanded: prefs.toggleTimelineExpanded,
    nextRound,
    prevRound,
    nextYear,
    prevYear,
    nextSession,
    prevSession,
  });

  const skipIntervalLabel =
    SKIP_INTERVAL_LABELS[prefs.skipIntervalMs] ?? `${prefs.skipIntervalMs / 1000}s`;

  const drivers = useMemo(() => data?.drivers ?? [], [data]);
  const selectedDrivers = useMemo(() => [], []);
  const hasStatus = loading || Boolean(error);
  const statusText = loading ? "Loading telemetry data…" : (error ?? "Loading telemetry data…");
  const statusClass = loading
    ? "border-amber-500/30 bg-amber-500/20 text-amber-300"
    : "border-red-500/30 bg-red-500/15 text-red-200";

  return (
    <div className="relative min-h-screen w-full overflow-y-auto text-white md:h-screen md:w-screen md:overflow-hidden">
      {/* Noise texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-55 mix-blend-overlay"
        style={{
          backgroundImage: "url('/noise.svg')",
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
          filter: "contrast(200%) brightness(400%)",
        }}
      />
      <header className="relative z-10 mx-4 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/20 bg-white/5 px-4 py-3 backdrop-blur-xl md:absolute md:left-4 md:right-80 md:top-4 md:mx-0 md:mt-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="flex items-center">
            <img src="/logo.png" alt="" className="h-6 w-auto" />
            <span className="sr-only">F1 Replay</span>
          </h1>
          <span
            className={`inline-flex min-w-[220px] max-w-[220px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap ${statusClass} ${
              hasStatus ? "" : "invisible"
            }`}
            aria-hidden={!hasStatus}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            <span className="truncate">{statusText}</span>
          </span>
        </div>
        <WeatherBadge weather={currentWeather} isLoading={loading} />
        <SessionPicker
          year={session.year}
          round={session.round}
          sessionType={session.sessionType}
          meetings={meetings}
          sessions={sessions}
          yearOptions={availableYears}
          isLoading={loading}
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
        {!hasSupportedSession && sessions.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            No supported session types (Race, Sprint, Qualifying) for this round. Choose another
            round.
          </div>
        )}
      </div>

      <div className="relative mx-4 mt-4 min-h-[260px] md:absolute md:inset-0 md:mx-0 md:mt-0 md:pb-44 md:pl-4 md:pr-80 md:pt-32">
        <TrackView
          trackPath={trackPath}
          driverStates={driverStates}
          driverNames={driverNames}
          selectedDrivers={selectedDrivers}
          className="h-full w-full"
        />
      </div>

      <footer className="relative z-10 mx-4 mt-4 md:absolute md:bottom-4 md:left-4 md:right-80 md:mx-0 md:mt-0">
        <div className="mb-2">
          <MarkerLegend
            hasEvents={timelineEvents.length > 0}
            legendCollapsed={legendCollapsed}
            onToggleLegendCollapsed={toggleLegendCollapsed}
            shortcutsCollapsed={shortcutsCollapsed}
            onToggleShortcutsCollapsed={toggleShortcutsCollapsed}
          />
        </div>
        <ControlsBar
          isPlaying={replay.isPlaying}
          isBuffering={replay.isBuffering}
          speed={prefs.speed}
          currentTimeMs={replay.currentTimeMs}
          startTimeMs={sessionStartMs}
          endTimeMs={effectiveEndMs}
          canPlay={canPlay}
          timelineEvents={timelineEvents}
          radioEnabled={prefs.radioEnabled}
          drivers={drivers}
          isRadioPlaying={isAudioPlaying}
          skipIntervalLabel={skipIntervalLabel}
          expanded={prefs.timelineExpanded}
          onTogglePlay={replay.togglePlay}
          onSkipBack={handleSkipBack}
          onSkipForward={handleSkipForward}
          onCycleSpeed={prefs.cycleSpeed}
          onCycleSkipInterval={prefs.cycleSkipInterval}
          onToggleExpanded={prefs.toggleTimelineExpanded}
          onSeek={replay.seekTo}
          onRadioToggle={prefs.toggleRadio}
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
          isLoading={loading}
        />
      </aside>
    </div>
  );
};
