import {
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ControlsBarProps } from "../types/replay.types";
import { formatTime } from "../utils/format.util";
import { TimelineSlider } from "./TimelineSlider";
import { Tooltip } from "./Tooltip";

export const ControlsBar = ({
  isPlaying,
  isBuffering,
  speed,
  currentTimeMs,
  startTimeMs,
  endTimeMs,
  canPlay,
  timelineEvents,
  radioEnabled,
  drivers,
  isRadioPlaying,
  skipIntervalLabel,
  expanded,
  onTogglePlay,
  onSkipBack,
  onSkipForward,
  onCycleSpeed,
  onCycleSkipInterval,
  onToggleExpanded,
  onSeek,
  onRadioToggle,
  onPlayRadio,
  onStopRadio,
  onPauseRadio,
  onResumeRadio,
  onMarkerClick,
}: ControlsBarProps) => {
  const radioTooltip = radioEnabled ? "Disable team radio" : "Enable team radio";
  const expandTooltip = expanded ? "Collapse timeline" : "Expand timeline";
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-white/20 bg-white/5 p-4 text-white backdrop-blur-xl">
      {/* Timeline row: time | slider | time | expand */}
      <div
        className={`mt-4 flex min-w-0 gap-3 text-xs text-white/60 ${expanded ? "items-end" : "items-center"}`}
      >
        <span className="shrink-0 font-mono text-xs tabular-nums text-white/50">
          {formatTime(currentTimeMs - startTimeMs)}
        </span>
        <div className="min-w-0 flex-1">
          <TimelineSlider
            currentTimeMs={currentTimeMs}
            startTimeMs={startTimeMs}
            endTimeMs={endTimeMs}
            events={timelineEvents}
            drivers={drivers}
            isPlaying={isPlaying}
            radioEnabled={radioEnabled}
            isRadioPlaying={isRadioPlaying}
            expanded={expanded}
            onSeek={onSeek}
            onPlayRadio={onPlayRadio}
            onStopRadio={onStopRadio}
            onPauseRadio={onPauseRadio}
            onResumeRadio={onResumeRadio}
            onMarkerClick={onMarkerClick}
            onTogglePlay={onTogglePlay}
          />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-white/50">
          {formatTime(endTimeMs - startTimeMs)}
        </span>
      </div>

      {/* Controls row: play | skip back | interval | skip fwd | buffering ... speed | radio | expand */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Play/Pause */}
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
            canPlay ? "bg-[#E10600] hover:bg-[#ff1801]" : "bg-white/10"
          }`}
          onClick={onTogglePlay}
          disabled={!canPlay}
        >
          {canPlay ? (
            isPlaying ? (
              <Pause size={18} />
            ) : (
              <Play size={18} />
            )
          ) : (
            <Loader2 size={18} className="animate-spin" />
          )}
        </button>

        {/* Skip back */}
        <Tooltip content="Skip back">
          <button
            type="button"
            onClick={onSkipBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
            aria-label="Skip back"
          >
            <SkipBack size={16} />
          </button>
        </Tooltip>

        {/* Skip interval toggle */}
        <Tooltip content="Change skip interval">
          <button
            type="button"
            onClick={onCycleSkipInterval}
            className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white/70 transition hover:bg-white/15 hover:text-white"
            aria-label="Change skip interval"
          >
            {skipIntervalLabel}
          </button>
        </Tooltip>

        {/* Skip forward */}
        <Tooltip content="Skip forward">
          <button
            type="button"
            onClick={onSkipForward}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
            aria-label="Skip forward"
          >
            <SkipForward size={16} />
          </button>
        </Tooltip>

        {isBuffering && <span className="text-xs text-white/50">Buffering...</span>}

        {/* Right-aligned group */}
        <div className="ml-auto flex items-center gap-2">
          {/* Consolidated speed button */}
          <Tooltip content="Cycle playback speed">
            <button
              type="button"
              onClick={onCycleSpeed}
              className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white/70 transition hover:bg-white/15 hover:text-white"
              aria-label="Cycle playback speed"
            >
              {speed}x
            </button>
          </Tooltip>

          {/* Radio toggle */}
          <Tooltip content={radioTooltip}>
            <button
              type="button"
              onClick={onRadioToggle}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                radioEnabled
                  ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                  : "bg-white/10 text-white/50 hover:bg-white/15"
              }`}
              aria-label={radioTooltip}
            >
              {radioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </Tooltip>

          {/* Expand/collapse timeline */}
          <Tooltip content={expandTooltip}>
            <button
              type="button"
              onClick={onToggleExpanded}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                expanded
                  ? "bg-white/20 text-white hover:bg-white/25"
                  : "bg-white/10 text-white/50 hover:bg-white/15"
              }`}
              aria-label={expandTooltip}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
