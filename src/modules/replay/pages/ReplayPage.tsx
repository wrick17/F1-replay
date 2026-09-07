import {
  Box,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  PanelsTopLeft,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HOME_PATH } from "../../../app/routing";
import { ControlsBar } from "../components/ControlsBar";
import { EventsPanel } from "../components/EventsPanel";
import { ReplayGameHUD } from "../components/ReplayGameHUD";
import { SessionPicker } from "../components/SessionPicker";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { TrackView } from "../components/TrackView";
import { WeatherBadge } from "../components/WeatherBadge";
import { SKIP_INTERVAL_LABELS } from "../constants/replay.constants";
import { useCircuitSurroundings } from "../hooks/useCircuitSurroundings";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useReplayController } from "../hooks/useReplayController";
import { useReplayData } from "../hooks/useReplayData";
import {
  getAdjacentReplayRound,
  getAvailableSessionTypes,
  useSessionAutoCorrect,
  useSessionState,
} from "../hooks/useSessionSelector";
import { useTeamRadio } from "../hooks/useTeamRadio";
import { useTrackComputation } from "../hooks/useTrackComputation";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { buildTimelineEvents, getActiveOvertakes } from "../services/events.service";
import { computeTelemetryRows, computeTelemetrySummary } from "../services/telemetry.service";
import { getWeatherAtTime } from "../services/weather.service";
import { getReplayEnvironment } from "../utils/replayEnvironment.util";

export const isReplayHeaderLoading = (
  isBlockingReplayLoad: boolean,
  isCarTelemetryLoading: boolean,
) => isBlockingReplayLoad || isCarTelemetryLoading;

export const ReplayPage = () => {
  const session = useSessionState();
  const prefs = useUserPreferences();

  const {
    data,
    loading,
    error,
    meetings,
    sessions,
    availableYears,
    loadedStartMs,
    loadedEndMs,
    sessionEndMs: finalSessionEndMs,
    dataRevision,
    manifest,
    requestWindow,
  } = useReplayData({
    year: session.year,
    round: session.round,
    sessionType: session.sessionType,
  });

  const { hasSupportedSession } = useSessionAutoCorrect({
    meetings,
    sessions,
    availableYears,
    year: session.year,
    hasExplicitYear: session.hasExplicitYear,
    round: session.round,
    sessionType: session.sessionType,
    setYear: session.setYear,
    setRound: session.setRound,
    setSessionType: session.setSessionType,
    manualRoundRef: session.manualRoundRef,
  });

  const sessionStartMs = data?.sessionStartMs ?? 0;
  const sessionEndMs = finalSessionEndMs || data?.sessionEndMs || 0;
  const effectiveEndMs = Math.max(sessionEndMs, sessionStartMs);
  const canPlay = Boolean(data) && effectiveEndMs > sessionStartMs && loadedEndMs > loadedStartMs;

  const replay = useReplayController({
    startTimeMs: sessionStartMs,
    endTimeMs: effectiveEndMs,
    loadedStartMs,
    loadedEndMs,
  });

  useEffect(() => {
    void requestWindow(replay.currentTimeMs);
  }, [replay.currentTimeMs, requestWindow]);

  // Sync persisted speed to replay controller
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when speed preference changes
  useEffect(() => {
    replay.setSpeed(prefs.speed);
  }, [prefs.speed]);

  const { trackPath, pitLanePath, driverStates, driverNames, driverFullNames, driverTeams } =
    useTrackComputation({
      data,
      dataRevision,
      currentTimeMs: replay.currentTimeMs,
    });

  const surroundings = useCircuitSurroundings(data?.meeting.circuit_key, trackPath);

  const telemetrySummary = useMemo(
    () => computeTelemetrySummary(data, loadedEndMs, effectiveEndMs, sessionStartMs),
    [data, loadedEndMs, effectiveEndMs, sessionStartMs],
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
  const environment = getReplayEnvironment(
    replay.currentTimeMs,
    data?.session.gmt_offset ?? data?.meeting.gmt_offset,
    currentWeather,
  );

  const activeOvertakes = useMemo(() => {
    if (!data) return [];
    return getActiveOvertakes(data.overtakes, replay.currentTimeMs);
  }, [data, replay.currentTimeMs]);

  const { currentRadio, isAudioPlaying, playRadio, stopRadio, pauseRadio, resumeRadio } =
    useTeamRadio();
  const replaySeekTo = replay.seekTo;
  const handleSeek = useCallback(
    (timestampMs: number) => {
      void requestWindow(timestampMs);
      replaySeekTo(timestampMs);
    },
    [replaySeekTo, requestWindow],
  );

  const handleSkipBack = useCallback(
    () => handleSeek(replay.currentTimeMs - prefs.skipIntervalMs),
    [handleSeek, replay.currentTimeMs, prefs.skipIntervalMs],
  );

  const handleSkipForward = useCallback(
    () => handleSeek(replay.currentTimeMs + prefs.skipIntervalMs),
    [handleSeek, replay.currentTimeMs, prefs.skipIntervalMs],
  );

  const handleEventSelect = useCallback(
    (timestampMs: number) => {
      handleSeek(timestampMs);
    },
    [handleSeek],
  );

  // Collapsible UI state (lightweight, not persisted)
  const [legendCollapsed, setLegendCollapsed] = useState(true);
  const [shortcutsCollapsed, setShortcutsCollapsed] = useState(true);
  const [telemetryCollapsed, setTelemetryCollapsed] = useState(false);
  const [eventsCollapsed, setEventsCollapsed] = useState(false);
  const [isCarTelemetryLoading, setIsCarTelemetryLoading] = useState(false);
  const [followDriver, setFollowDriver] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: changing races resets the camera's driver selection
  useEffect(() => {
    setFollowDriver(null);
  }, [data?.session.session_key]);
  const [wants3D, setWants3D] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [panelsVisible, setPanelsVisible] = useState(true);
  const [Scene, setScene] = useState<typeof import("../components/TrackView3D").default | null>(
    null,
  );
  const show3D = wants3D && sceneReady;
  const handleSceneReady = useCallback(() => setSceneReady(true), []);
  const handleSceneError = useCallback((message: string) => {
    setSceneError(message);
    setWants3D(false);
    setSceneReady(false);
    setScene(null);
  }, []);

  useEffect(() => {
    if (!wants3D || Scene) return;
    let cancelled = false;
    import("../components/TrackView3D")
      .then((module) => {
        if (!cancelled) setScene(() => module.default);
      })
      .catch(() => {
        if (!cancelled) handleSceneError("The 3D view could not load. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [wants3D, Scene, handleSceneError]);

  const toggleLegendCollapsed = useCallback(() => setLegendCollapsed((prev) => !prev), []);
  const toggleShortcutsCollapsed = useCallback(() => setShortcutsCollapsed((prev) => !prev), []);
  const toggleTelemetryCollapsed = useCallback(() => setTelemetryCollapsed((prev) => !prev), []);
  const toggleEventsCollapsed = useCallback(() => setEventsCollapsed((prev) => !prev), []);

  const availableSessionTypes = useMemo(() => getAvailableSessionTypes(sessions), [sessions]);
  const selectedYear = session.year ?? availableYears[0] ?? new Date().getFullYear();

  const nextRound = useCallback(() => {
    if (!meetings.length) {
      return;
    }
    session.manualRoundRef.current = true;
    session.setRound((prev) => getAdjacentReplayRound(meetings, prev, 1));
  }, [meetings, session]);

  const prevRound = useCallback(() => {
    if (!meetings.length) {
      return;
    }
    session.manualRoundRef.current = true;
    session.setRound((prev) => getAdjacentReplayRound(meetings, prev, -1));
  }, [meetings, session]);

  const nextYear = useCallback(() => {
    if (!availableYears.length) {
      return;
    }
    const sorted = [...availableYears].sort((a, b) => b - a);
    const index = sorted.indexOf(selectedYear);
    const nextIndex = Math.max(0, index - 1);
    session.setYear(sorted[nextIndex] ?? sorted[0]);
  }, [availableYears, selectedYear, session]);

  const prevYear = useCallback(() => {
    if (!availableYears.length) {
      return;
    }
    const sorted = [...availableYears].sort((a, b) => b - a);
    const index = sorted.indexOf(selectedYear);
    const nextIndex = Math.min(sorted.length - 1, index + 1);
    session.setYear(sorted[nextIndex] ?? sorted[sorted.length - 1]);
  }, [availableYears, selectedYear, session]);

  const nextSession = useCallback(() => {
    if (!availableSessionTypes.length) {
      return;
    }
    const currentIndex = availableSessionTypes.indexOf(session.sessionType);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % availableSessionTypes.length : 0;
    session.setSessionType(availableSessionTypes[nextIndex] ?? availableSessionTypes[0]);
  }, [availableSessionTypes, session]);

  const prevSession = useCallback(() => {
    if (!availableSessionTypes.length) {
      return;
    }
    const currentIndex = availableSessionTypes.indexOf(session.sessionType);
    const prevIndex =
      currentIndex >= 0
        ? (currentIndex - 1 + availableSessionTypes.length) % availableSessionTypes.length
        : availableSessionTypes.length - 1;
    session.setSessionType(
      availableSessionTypes[prevIndex] ?? availableSessionTypes[availableSessionTypes.length - 1],
    );
  }, [availableSessionTypes, session]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    togglePlay: replay.togglePlay,
    seekTo: handleSeek,
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
  const desktopControlsClearanceClass = prefs.timelineExpanded
    ? "md:bottom-[11.25rem]"
    : "md:bottom-[8.75rem]";

  const drivers = useMemo(() => data?.drivers ?? [], [data]);
  const selectedDrivers = useMemo(() => [], []);
  const isBlockingLoad = loading && !data;
  const isHeaderLoading = isReplayHeaderLoading(isBlockingLoad, isCarTelemetryLoading);
  const hasStatus = isHeaderLoading || Boolean(error);
  const statusText = isHeaderLoading
    ? "Loading telemetry data…"
    : (error ?? "Loading telemetry data…");
  const statusClass = isHeaderLoading
    ? "border-amber-500/30 bg-amber-500/20 text-amber-300"
    : "border-red-500/30 bg-red-500/15 text-red-200";

  const telemetryPanel = (
    <TelemetryPanel
      autoEnable={show3D}
      summary={telemetrySummary}
      rows={
        show3D
          ? telemetryRows.filter(
              (row) => row.driverNumber === (followDriver ?? telemetryRows[0]?.driverNumber),
            )
          : telemetryRows
      }
      activeOvertakes={activeOvertakes}
      isLoading={isBlockingLoad}
      currentTimeMs={replay.currentTimeMs}
      sessionKey={data?.session.session_key ?? null}
      sessionStartMs={data?.sessionStartMs ?? 0}
      sessionEndMs={data?.sessionEndMs ?? 0}
      archiveManifest={manifest}
      onTelemetryLoadingChange={setIsCarTelemetryLoading}
    />
  );
  const eventsPanel = (
    <EventsPanel
      events={timelineEvents}
      startTimeMs={sessionStartMs}
      currentTimeMs={replay.currentTimeMs}
      isPlaying={replay.isPlaying}
      radioEnabled={prefs.radioEnabled}
      isRadioPlaying={isAudioPlaying}
      currentRadio={currentRadio}
      onPlayRadio={playRadio}
      onStopRadio={stopRadio}
      hasEvents={timelineEvents.length > 0}
      legendCollapsed={legendCollapsed}
      shortcutsCollapsed={shortcutsCollapsed}
      onToggleLegendCollapsed={toggleLegendCollapsed}
      onToggleShortcutsCollapsed={toggleShortcutsCollapsed}
      onSelectEvent={handleEventSelect}
    />
  );
  const sessionPicker = (
    <SessionPicker
      year={selectedYear}
      round={session.round}
      sessionType={session.sessionType}
      meetings={meetings}
      sessions={sessions}
      yearOptions={availableYears}
      isLoading={isBlockingLoad}
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
  );
  const playbackControls = (
    <ControlsBar
      isPlaying={replay.isPlaying}
      isBuffering={replay.isBuffering}
      speed={prefs.speed}
      currentTimeMs={replay.currentTimeMs}
      startTimeMs={sessionStartMs}
      endTimeMs={effectiveEndMs}
      canPlay={canPlay}
      timelineEvents={timelineEvents}
      hasTeamRadio={Boolean(data?.teamRadios?.length)}
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
      onSeek={handleSeek}
      onRadioToggle={prefs.toggleRadio}
      onPlayRadio={playRadio}
      onStopRadio={stopRadio}
      onPauseRadio={pauseRadio}
      onResumeRadio={resumeRadio}
      onMarkerClick={handleSeek}
    />
  );

  return (
    <div
      className={`replay-shell relative min-h-screen w-full overflow-y-auto text-white md:h-screen md:w-screen md:overflow-hidden ${show3D ? "replay-is-3d" : ""} ${show3D && !panelsVisible ? "replay-panels-hidden" : ""}`}
      data-view={show3D ? "3d" : "2d"}
    >
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
      <header className="replay-header relative z-10 mx-4 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/20 bg-white/5 px-4 py-3 backdrop-blur-xl md:absolute md:left-4 md:right-80 md:top-4 md:mx-0 md:mt-0">
        <div className="replay-brand flex flex-wrap items-center gap-2">
          <a href={HOME_PATH} className="flex items-center" aria-label="Go to home page">
            <img src="/logo.png" alt="" className="h-6 w-auto" />
            <span className="sr-only">F1 Replay</span>
          </a>
          <button
            type="button"
            className="replay-view-toggle"
            aria-label={wants3D ? "Switch to 2D view" : "Switch to 3D view"}
            aria-pressed={wants3D}
            onClick={() => {
              setSceneError(null);
              if (!wants3D) setPanelsVisible(true);
              setWants3D((previous) => !previous);
            }}
          >
            {wants3D && !sceneReady ? (
              <Loader2 size={15} className="animate-spin" />
            ) : wants3D ? (
              <Layers size={15} />
            ) : (
              <Box size={15} />
            )}
            <span>{show3D ? "3D" : "2D"}</span>
          </button>
          {show3D && (
            <button
              type="button"
              className="replay-view-toggle"
              aria-label={panelsVisible ? "Hide replay panels" : "Show replay panels"}
              aria-pressed={panelsVisible}
              onClick={() => setPanelsVisible((previous) => !previous)}
            >
              <PanelsTopLeft size={15} />
              <span className="replay-panels-label">Panels</span>
            </button>
          )}
          {show3D && document.fullscreenEnabled && (
            <button
              type="button"
              className="replay-view-toggle"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              onClick={() => {
                const action = document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen();
                void action.catch(() =>
                  setSceneError("Fullscreen is unavailable in this browser."),
                );
              }}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          <span
            className={`replay-load-status inline-flex min-w-[220px] max-w-[220px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap ${statusClass} ${
              hasStatus ? "" : "invisible"
            }`}
            aria-hidden={!hasStatus}
            aria-live={error ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {isHeaderLoading && <Loader2 size={14} className="animate-spin" />}
            <span className="truncate">{statusText}</span>
          </span>
        </div>
        {!show3D && <WeatherBadge weather={currentWeather} isLoading={isBlockingLoad} />}
        {show3D ? (
          <details className="replay-game-session">
            <summary>
              <span className="replay-game-race-title">
                {data?.meeting.meeting_name ?? "F1 Replay"}
              </span>
              <span className="replay-game-session-type">
                {selectedYear} · {session.sessionType}
              </span>
              <ChevronDown size={14} />
            </summary>
            <div className="replay-game-session-menu">{sessionPicker}</div>
          </details>
        ) : (
          sessionPicker
        )}
      </header>

      <div className="relative z-10 mx-4 mt-3 flex max-w-[420px] flex-col gap-2 md:absolute md:left-4 md:top-24 md:mx-0 md:mt-0">
        {sceneError && (
          <output className="rounded-lg border border-amber-500/40 bg-black/80 px-3 py-2 text-xs text-amber-200">
            {sceneError} The 2D replay is still available.
          </output>
        )}
        {!hasSupportedSession && sessions.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            No replayable session types are available for this round yet. Choose another round.
          </div>
        )}
      </div>

      <div className="replay-stage relative mx-4 mt-4 min-h-[260px] md:absolute md:inset-0 md:mx-0 md:mt-0">
        <div
          className="replay-flat h-full w-full md:pb-44 md:pl-[17.5rem] md:pr-80 md:pt-32"
          inert={show3D}
          aria-hidden={show3D}
        >
          <TrackView
            surroundings={surroundings}
            trackPath={trackPath}
            pitLanePath={pitLanePath}
            driverStates={driverStates}
            driverNames={driverNames}
            driverFullNames={driverFullNames}
            driverTeams={driverTeams}
            selectedDrivers={selectedDrivers}
            className="h-full w-full"
          />
        </div>
        {Scene && (
          <div className="replay-spatial absolute inset-0" inert={!show3D} aria-hidden={!show3D}>
            <Scene
              surroundings={surroundings}
              circuitKey={data?.meeting.circuit_key}
              trackPath={trackPath}
              pitLanePath={pitLanePath}
              driverStates={driverStates}
              driverNames={driverNames}
              driverFullNames={driverFullNames}
              driverTeams={driverTeams}
              selectedDrivers={selectedDrivers}
              className="h-full w-full"
              active={wants3D}
              environment={environment}
              followDriver={followDriver}
              onFollowDriver={setFollowDriver}
              onReady={handleSceneReady}
              onError={handleSceneError}
            />
          </div>
        )}
      </div>

      {surroundings && (
        <div className="fixed bottom-1 right-2 z-50 rounded bg-slate-950/90 px-2 py-0.5 text-[10px] text-slate-300">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            © OpenStreetMap contributors · ODbL
          </a>
          {surroundings.terrain && (
            <>
              {" "}
              ·{" "}
              <a
                href="/circuits/TERRAIN-LICENSE.txt"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Copernicus DEM
              </a>
            </>
          )}
        </div>
      )}

      {show3D && (
        <ReplayGameHUD
          rows={telemetryRows}
          driverStates={driverStates}
          events={timelineEvents}
          currentTimeMs={replay.currentTimeMs}
          startTimeMs={sessionStartMs}
          isPlaying={replay.isPlaying}
          weather={currentWeather}
          environment={environment}
          meetingName={data?.meeting.meeting_name ?? "F1 Replay"}
          sessionType={session.sessionType}
          panelsVisible={panelsVisible}
          onSeek={handleSeek}
          controls={playbackControls}
          telemetryPanel={telemetryPanel}
          eventsPanel={eventsPanel}
          onShowPanels={() => setPanelsVisible(true)}
          followDriver={followDriver}
          onFollowDriver={setFollowDriver}
        />
      )}

      <footer className="relative z-10 mx-4 mt-4 md:absolute md:bottom-4 md:left-4 md:right-80 md:mx-0 md:mt-0">
        {!show3D && playbackControls}
      </footer>

      <aside
        className="relative z-10 mx-4 mt-4 mb-4 md:absolute md:right-4 md:top-4 md:bottom-4 md:mx-0 md:mt-0 md:mb-0 md:min-h-0 md:w-72 md:overflow-hidden"
        data-testid="telemetry-panel"
      >
        {telemetryCollapsed && (
          <button
            type="button"
            onClick={toggleTelemetryCollapsed}
            className="flex w-full items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white/70 md:hidden"
          >
            <ChevronRight size={14} />
            Leaderboard
          </button>
        )}
        <div className={`${telemetryCollapsed ? "hidden" : "block"} md:block md:h-full md:min-h-0`}>
          <div className="h-[60vh] min-h-[320px] md:h-full md:min-h-0">
            {!show3D && telemetryPanel}
          </div>
        </div>
      </aside>

      <aside
        className={`relative z-10 mx-4 mt-4 mb-6 md:absolute md:left-4 md:top-40 ${desktopControlsClearanceClass} md:mx-0 md:mt-0 md:mb-0 md:min-h-0 md:w-64 md:overflow-hidden`}
        data-testid="events-panel-wrapper"
      >
        {eventsCollapsed && (
          <button
            type="button"
            onClick={toggleEventsCollapsed}
            className="flex w-full items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white/70 md:hidden"
          >
            <ChevronRight size={14} />
            Race Events
          </button>
        )}
        <div className={`${eventsCollapsed ? "hidden" : "block"} md:block md:h-full md:min-h-0`}>
          <div className="h-[45vh] min-h-[260px] md:h-full md:min-h-0">
            {!show3D && eventsPanel}
          </div>
        </div>
      </aside>
    </div>
  );
};
