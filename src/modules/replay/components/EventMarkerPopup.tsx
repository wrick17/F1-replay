import type { TimelineEvent } from "../types/replay.types";
import { formatTime } from "../utils/format.util";

type EventMarkerPopupProps = {
  event: TimelineEvent;
  startTimeMs: number;
};

const TYPE_LABELS: Record<string, string> = {
  radio: "Team Radio",
  overtake: "Overtake",
  flag: "Flag",
  "safety-car": "Safety Car",
  pit: "Pit Stop",
  "race-control": "Race Control",
};

export const EventMarkerPopup = ({ event, startTimeMs }: EventMarkerPopupProps) => {
  const typeLabel = TYPE_LABELS[event.type] ?? event.type;
  const elapsed = formatTime(event.timestampMs - startTimeMs);

  return (
    <div className="pointer-events-none w-56 rounded-lg border border-white/20 bg-black/90 p-3 text-xs text-white shadow-xl backdrop-blur-xl">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: event.color }}
        />
        <span className="font-semibold">{typeLabel}</span>
        <span className="ml-auto text-white/40">{elapsed}</span>
      </div>
      <div className="text-white/70">{event.detail}</div>
    </div>
  );
};
