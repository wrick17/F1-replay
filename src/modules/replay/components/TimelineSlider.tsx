import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OpenF1Driver, OpenF1TeamRadio, TimedSample } from "../types/openf1.types";
import type { TimelineEvent } from "../types/replay.types";
import { EventMarkerPopup } from "./EventMarkerPopup";
import { RadioPopup } from "./RadioPopup";

const EVENT_WINDOW_MS = 2000;
const EVENT_DISPLAY_DURATION_MS = 5000;

type TimelineSliderProps = {
  currentTimeMs: number;
  startTimeMs: number;
  endTimeMs: number;
  events: TimelineEvent[];
  drivers: OpenF1Driver[];
  isPlaying: boolean;
  radioEnabled: boolean;
  isRadioPlaying: boolean;
  onSeek: (timestampMs: number) => void;
  onPlayRadio: (radio: TimedSample<OpenF1TeamRadio>) => void;
  onStopRadio: () => void;
  onPauseRadio: () => void;
  onResumeRadio: () => void;
  onMarkerClick?: (timestampMs: number) => void;
};

export const TimelineSlider = ({
  currentTimeMs,
  startTimeMs,
  endTimeMs,
  events,
  drivers,
  isPlaying,
  radioEnabled,
  isRadioPlaying,
  onSeek,
  onPlayRadio,
  onStopRadio,
  onPauseRadio,
  onResumeRadio,
  onMarkerClick,
}: TimelineSliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual hover state (user-initiated)
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Auto-shown popup state (playback-initiated)
  const [autoShownEvent, setAutoShownEvent] = useState<TimelineEvent | null>(null);
  const [autoHoverPos, setAutoHoverPos] = useState<{ x: number; y: number } | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedEventsRef = useRef(new Set<string>());
  const lastTimeMsRef = useRef(currentTimeMs);

  // Track whether radio was playing before race was paused
  const wasPlayingBeforePauseRef = useRef(false);
  const prevIsPlayingRef = useRef(isPlaying);

  // Refs for stable access in the auto-popup effect (avoids stale closures and dependency churn)
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const hoveredEventRef = useRef(hoveredEvent);
  hoveredEventRef.current = hoveredEvent;
  const radioEnabledRef = useRef(radioEnabled);
  radioEnabledRef.current = radioEnabled;
  const isRadioPlayingRef = useRef(isRadioPlaying);
  isRadioPlayingRef.current = isRadioPlaying;
  const autoShownEventRef = useRef(autoShownEvent);
  autoShownEventRef.current = autoShownEvent;
  const onPlayRadioRef = useRef(onPlayRadio);
  onPlayRadioRef.current = onPlayRadio;
  const onStopRadioRef = useRef(onStopRadio);
  onStopRadioRef.current = onStopRadio;

  const duration = Math.max(1, endTimeMs - startTimeMs);
  const progress = ((currentTimeMs - startTimeMs) / duration) * 100;

  // Determine which popup to display (manual hover takes priority)
  const displayedEvent = hoveredEvent ?? autoShownEvent;
  const displayedPos = hoveredEvent ? hoverPos : autoHoverPos;

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

  const computeMarkerPercent = useCallback(
    (timestampMs: number) => {
      return ((timestampMs - startTimeMs) / duration) * 100;
    },
    [startTimeMs, duration],
  );

  const handleMarkerEnter = (event: TimelineEvent, buttonEl: HTMLButtonElement) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredEvent(event);
    const rect = buttonEl.getBoundingClientRect();
    setHoverPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const clearAutoPopup = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoShownEvent(null);
    setAutoHoverPos(null);
  }, []);

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
    if (hoveredEvent) {
      closePopup();
    }
  };

  // Reset processed events when session changes
  const startTimeMsRef = useRef(startTimeMs);
  useEffect(() => {
    if (startTimeMsRef.current !== startTimeMs) {
      startTimeMsRef.current = startTimeMs;
      processedEventsRef.current.clear();
      clearAutoPopup();
    }
  }, [startTimeMs, clearAutoPopup]);

  // Auto-show event popups during playback
  useEffect(() => {
    if (!isPlayingRef.current || eventsRef.current.length === 0) return;

    const prevTime = lastTimeMsRef.current;
    lastTimeMsRef.current = currentTimeMs;

    if (currentTimeMs <= prevTime) return;
    if (hoveredEventRef.current) return;

    for (const event of eventsRef.current) {
      const diff = currentTimeMs - event.timestampMs;
      if (diff >= 0 && diff <= EVENT_WINDOW_MS) {
        const key = `${event.type}-${event.timestampMs}`;
        if (!processedEventsRef.current.has(key)) {
          processedEventsRef.current.add(key);

          const trackEl = trackRef.current;
          if (trackEl) {
            const trackRect = trackEl.getBoundingClientRect();
            const left = computeMarkerPercent(event.timestampMs);
            const x = trackRect.left + (left / 100) * trackRect.width;
            const y = trackRect.top - 20;

            if (autoTimerRef.current) {
              clearTimeout(autoTimerRef.current);
            }

            if (autoShownEventRef.current?.type === "radio" && isRadioPlayingRef.current) {
              onStopRadioRef.current();
            }

            setAutoShownEvent(event);
            setAutoHoverPos({ x, y });

            if (event.type === "radio" && radioEnabledRef.current) {
              onPlayRadioRef.current(event.data as TimedSample<OpenF1TeamRadio>);
            }

            autoTimerRef.current = setTimeout(() => {
              setAutoShownEvent((current) => {
                if (current === event) {
                  if (event.type === "radio") {
                    onStopRadioRef.current();
                  }
                  return null;
                }
                return current;
              });
              setAutoHoverPos(null);
              autoTimerRef.current = null;
            }, EVENT_DISPLAY_DURATION_MS);
          }
          break;
        }
      }
    }
  }, [currentTimeMs, computeMarkerPercent]);

  // Handle race pause/resume -> radio pause/resume
  useEffect(() => {
    const wasPreviouslyPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;

    if (wasPreviouslyPlaying && !isPlaying) {
      if (isRadioPlaying) {
        wasPlayingBeforePauseRef.current = true;
        onPauseRadio();
      } else {
        wasPlayingBeforePauseRef.current = false;
      }
    }

    if (!wasPreviouslyPlaying && isPlaying) {
      if (wasPlayingBeforePauseRef.current && autoShownEvent?.type === "radio") {
        onResumeRadio();
      }
      wasPlayingBeforePauseRef.current = false;
    }
  }, [isPlaying, isRadioPlaying, onPauseRadio, onResumeRadio, autoShownEvent]);

  // Update lastTimeMsRef for seek detection
  useEffect(() => {
    lastTimeMsRef.current = currentTimeMs;
  }, [currentTimeMs]);

  return (
    <div className="relative w-full select-none py-2">
      {/* Event markers row */}
      <div className="relative mb-1 h-3">
        {events.map((event, index) => {
          const left = computeMarkerPercent(event.timestampMs);
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

      {/* Hover/auto popup — rendered via portal to escape backdrop-filter containing block */}
      {displayedEvent &&
        displayedPos &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-9999"
            style={{
              left: displayedPos.x,
              top: displayedPos.y - 8,
              transform: "translate(-50%, -100%)",
            }}
            onMouseEnter={handlePopupEnter}
            onMouseLeave={handlePopupLeave}
          >
            {displayedEvent.type === "radio" ? (
              <RadioPopup
                radio={displayedEvent.data as TimedSample<OpenF1TeamRadio>}
                drivers={drivers}
                startTimeMs={startTimeMs}
                isPlaying={isRadioPlaying}
                onPlay={onPlayRadio}
                onStop={onStopRadio}
                showAudioControls={radioEnabled}
              />
            ) : (
              <EventMarkerPopup event={displayedEvent} startTimeMs={startTimeMs} />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};
