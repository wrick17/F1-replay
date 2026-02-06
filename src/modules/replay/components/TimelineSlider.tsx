import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OpenF1Driver, OpenF1TeamRadio, TimedSample } from "../types/openf1.types";
import type { TimelineEvent } from "../types/replay.types";
import { EventMarkerPopup } from "./EventMarkerPopup";
import { RadioPopup } from "./RadioPopup";

type TimelineSliderProps = {
  currentTimeMs: number;
  startTimeMs: number;
  endTimeMs: number;
  events: TimelineEvent[];
  drivers: OpenF1Driver[];
  isRadioPlaying: boolean;
  onSeek: (timestampMs: number) => void;
  onPlayRadio: (radio: TimedSample<OpenF1TeamRadio>) => void;
  onStopRadio: () => void;
  onMarkerClick?: (timestampMs: number) => void;
};

export const TimelineSlider = ({
  currentTimeMs,
  startTimeMs,
  endTimeMs,
  events,
  drivers,
  isRadioPlaying,
  onSeek,
  onPlayRadio,
  onStopRadio,
  onMarkerClick,
}: TimelineSliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleMarkerEnter = (event: TimelineEvent, buttonEl: HTMLButtonElement) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredEvent(event);
    const rect = buttonEl.getBoundingClientRect();
    setHoverPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const closePopup = useCallback(() => {
    if (hoveredEvent?.type === "radio" && isRadioPlaying) {
      onStopRadio();
    }
    setHoveredEvent(null);
    setHoverPos(null);
  }, [hoveredEvent, isRadioPlaying, onStopRadio]);

  const handleMarkerLeave = () => {
    hoverTimeout.current = setTimeout(closePopup, 200);
  };

  const handlePopupEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  };

  const handlePopupLeave = () => {
    closePopup();
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
              className="absolute bottom-0 w-[3px] cursor-pointer border-none bg-transparent p-0 pb-0 pt-4"
              style={{
                left: `${left}%`,
                transform: "translateX(-50%)",
              }}
              onClick={() => onMarkerClick?.(event.timestampMs)}
              onMouseEnter={(e) => handleMarkerEnter(event, e.currentTarget)}
              onMouseLeave={handleMarkerLeave}
            >
              <span
                className="block h-3 w-[3px] rounded-sm"
                style={{ backgroundColor: event.color, opacity: 0.8 }}
              />
            </button>
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
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#E10600]"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#E10600] bg-white shadow-md"
          style={{ left: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      {/* Hover popup — rendered via portal to escape backdrop-filter containing block */}
      {hoveredEvent &&
        hoverPos &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-9999"
            style={{
              left: hoverPos.x,
              top: hoverPos.y - 8,
              transform: "translate(-50%, -100%)",
            }}
            onMouseEnter={handlePopupEnter}
            onMouseLeave={handlePopupLeave}
          >
            {hoveredEvent.type === "radio" ? (
              <RadioPopup
                radio={hoveredEvent.data as TimedSample<OpenF1TeamRadio>}
                drivers={drivers}
                startTimeMs={startTimeMs}
                isPlaying={isRadioPlaying}
                onPlay={onPlayRadio}
                onStop={onStopRadio}
              />
            ) : (
              <EventMarkerPopup event={hoveredEvent} startTimeMs={startTimeMs} />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};
