import { Pause, Play } from "lucide-react";
import type { OpenF1Driver, OpenF1TeamRadio, TimedSample } from "../types/openf1.types";
import { formatTime } from "../utils/format.util";

type RadioPopupProps = {
  radio: TimedSample<OpenF1TeamRadio>;
  drivers: OpenF1Driver[];
  startTimeMs: number;
  isPlaying: boolean;
  onPlay: (radio: TimedSample<OpenF1TeamRadio>) => void;
  onStop: () => void;
};

const WaveformBars = ({ active }: { active: boolean }) => {
  const bars = [
    { id: "b1", h: 40, delay: 0.4 },
    { id: "b2", h: 70, delay: 0.5 },
    { id: "b3", h: 50, delay: 0.6 },
    { id: "b4", h: 85, delay: 0.7 },
    { id: "b5", h: 60, delay: 0.8 },
  ];
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 20 }}>
      {bars.map((bar) => (
        <div
          key={bar.id}
          className="w-[3px] rounded-sm bg-blue-400"
          style={{
            height: active ? `${bar.h}%` : "20%",
            transition: "height 0.15s ease",
            animation: active ? `waveform ${bar.delay}s ease-in-out infinite alternate` : "none",
          }}
        />
      ))}
    </div>
  );
};

export const RadioPopup = ({
  radio,
  drivers,
  startTimeMs,
  isPlaying,
  onPlay,
  onStop,
}: RadioPopupProps) => {
  const driver = drivers.find((d) => d.driver_number === radio.driver_number);
  const name = driver?.name_acronym ?? String(radio.driver_number);
  const fullName = driver?.broadcast_name ?? driver?.full_name ?? name;
  const elapsed = formatTime(radio.timestampMs - startTimeMs);

  return (
    <div className="w-60 rounded-lg border border-white/20 bg-black/90 p-3 text-xs text-white shadow-xl backdrop-blur-xl">
      <style>{`
        @keyframes waveform {
          from { height: 20%; }
          to { height: var(--wave-h, 80%); }
        }
      `}</style>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: driver?.team_colour ? `#${driver.team_colour}` : "#3b82f6" }}
        >
          {name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{fullName}</div>
          <div className="text-white/40">{elapsed}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition hover:bg-blue-400"
          onClick={() => (isPlaying ? onStop() : onPlay(radio))}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <WaveformBars active={isPlaying} />
      </div>
    </div>
  );
};
