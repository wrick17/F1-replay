import { useCallback, useRef, useState } from "react";
import type { TimelineEvent } from "../types/replay.types";
import { EventMarkerPopup } from "./EventMarkerPopup";

type TimelineSliderProps = {
  currentTimeMs: number;
  startTimeMs: number;
  endTimeMs: number;
  events: TimelineEvent[];
  onSeek: (timestampMs: number) => void;
};

export const TimelineSlider = ({
  currentTimeMs,
  startTimeMs,
  endTimeMs,
  events,
  onSeek,
}: TimelineSliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const duration = Math.max(1, endTimeMs - startTimeMs);
  const progress = ((currentTimeMs - startTimeMs) / duration) * 100;

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(startTimeMs + ratio * duration);
    },
    [startTimeMs, duration, onSeek],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      seekFromPointer(e.clientX);
    },
    [seekFromPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging.current) {
        seekFromPointer(e.clientX);
      }
    },
    [seekFromPointer],
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const markerPosition = (timestampMs: number) => {
    return ((timestampMs - startTimeMs) / duration) * 100;
  };

  return (
    <div className="relative w-full select-none py-2">
      {/* Event markers row */}
      <div className="relative mb-1 h-3">
        {events.map((event, index) => {
          const left = markerPosition(event.timestampMs);
          if (left < 0 || left > 100) return null;
          return (
            <button
              type="button"
              key={`${event.type}-${event.timestampMs}-${index}`}
              className="absolute top-0 h-3 w-[2px] cursor-pointer rounded-sm border-none bg-transparent p-0 transition-opacity hover:opacity-100"
              style={{
                left: `${left}%`,
                backgroundColor: event.color,
                opacity: 0.7,
                transform: "translateX(-50%)",
              }}
              onMouseEnter={(e) => {
                setHoveredEvent(event);
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverPos({ x: rect.left + rect.width / 2, y: rect.top });
              }}
              onMouseLeave={() => {
                setHoveredEvent(null);
                setHoverPos(null);
              }}
            />
          );
        })}
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative h-2 cursor-pointer rounded-full bg-white/10"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#E10600]"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#E10600] bg-white shadow-md"
          style={{ left: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      {/* Hover popup */}
      {hoveredEvent && hoverPos && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: hoverPos.x,
            top: hoverPos.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <EventMarkerPopup event={hoveredEvent} startTimeMs={startTimeMs} />
        </div>
      )}
    </div>
  );
};
