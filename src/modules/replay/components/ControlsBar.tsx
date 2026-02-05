type ControlsBarProps = {
  isPlaying: boolean;
  isBuffering: boolean;
  isLive: boolean;
  speed: number;
  currentTimeMs: number;
  startTimeMs: number;
  endTimeMs: number;
  canPlay: boolean;
  onTogglePlay: () => void;
  onToggleLive: () => void;
  onSpeedChange: (value: number) => void;
  onSeek: (timestampMs: number) => void;
};

const SPEED_OPTIONS = [0.5, 1, 2, 4];

const formatTime = (timestampMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export const ControlsBar = ({
  isPlaying,
  isBuffering,
  isLive,
  speed,
  currentTimeMs,
  startTimeMs,
  endTimeMs,
  canPlay,
  onTogglePlay,
  onToggleLive,
  onSpeedChange,
  onSeek,
}: ControlsBarProps) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-white/20 bg-white/5 p-4 text-white backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
            canPlay ? "bg-[#E10600] hover:bg-[#ff1801]" : "bg-white/10"
          }`}
          onClick={onTogglePlay}
          disabled={!canPlay}
        >
          {canPlay ? (isPlaying ? "Pause" : "Play") : "Loading"}
        </button>
        <button
          type="button"
          onClick={onToggleLive}
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
            isLive
              ? "bg-[#E10600] text-white"
              : "bg-white/10 text-white/70 hover:bg-white/20"
          }`}
          aria-pressed={isLive}
        >
          Live
        </button>
        {isBuffering && (
          <span className="text-xs text-white/50">Buffering...</span>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-white/60">
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSpeedChange(option)}
              className={`rounded-md px-2 py-1 ${
                speed === option
                  ? "bg-white text-black"
                  : "bg-white/15 text-white/70"
              }`}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3 text-xs text-white/60">
        <span className="text-xs text-white/50">
          {formatTime(currentTimeMs - startTimeMs)}
        </span>
        <input
          type="range"
          min={startTimeMs}
          max={endTimeMs}
          value={currentTimeMs}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="h-1 flex-1 accent-[#E10600]"
        />
        <span className="text-xs text-white/50">
          {formatTime(endTimeMs - startTimeMs)}
        </span>
      </div>
    </div>
  );
};
