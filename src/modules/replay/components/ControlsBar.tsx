import { Loader2, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { SPEED_OPTIONS } from "../constants/replay.constants";
import type { ControlsBarProps } from "../types/replay.types";
import { formatTime } from "../utils/format.util";
import { TimelineSlider } from "./TimelineSlider";

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
  onTogglePlay,
  onSpeedChange,
  onSeek,
  onRadioToggle,
  onPlayRadio,
  onStopRadio,
  onPauseRadio,
  onResumeRadio,
  onMarkerClick,
}: ControlsBarProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-white/20 bg-white/5 p-4 text-white backdrop-blur-xl">
      {/* Timeline row: time | slider | time | expand */}
      <div className={`mt-4 flex min-w-0 gap-3 text-xs text-white/60 ${expanded ? "items-end" : "items-center"}`}>
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
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={`shrink-0 rounded-lg px-2 py-1.5 transition ${
            expanded
              ? "bg-white/20 text-white hover:bg-white/25"
              : "bg-white/10 text-white/50 hover:bg-white/15"
          }`}
          title={expanded ? "Collapse timeline" : "Expand timeline"}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Controls row: play | radio | buffering ... speed buttons */}
      <div className="flex flex-wrap items-center gap-4">
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
        <button
          type="button"
          onClick={onRadioToggle}
          className={`rounded-lg px-3 py-2 transition ${
            radioEnabled
              ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
              : "bg-white/10 text-white/50 hover:bg-white/15"
          }`}
          title={radioEnabled ? "Disable team radio" : "Enable team radio"}
        >
          {radioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        {isBuffering && <span className="text-xs text-white/50">Buffering...</span>}
        <div className="ml-auto flex items-center gap-2 text-xs text-white/60">
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSpeedChange(option)}
              className={`rounded-md px-2 py-1 ${
                speed === option ? "bg-white text-black" : "bg-white/15 text-white/70"
              }`}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
