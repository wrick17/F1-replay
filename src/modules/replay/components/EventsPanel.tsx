import { Pause, Play } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import type { OpenF1TeamRadio, TimedSample } from "../types/openf1.types";
import type { EventsPanelProps } from "../types/replay.types";
import { formatTime } from "../utils/format.util";
import { MarkerLegend } from "./MarkerLegend";

const ACTIVE_EVENT_WINDOW_MS = 2000;
const AUTO_SCROLL_TARGET_RATIO = 0.2;

const getCurrentEventIndex = (timestamps: number[], currentTimeMs: number): number => {
  if (timestamps.length === 0) {
    return -1;
  }
  let low = 0;
  let high = timestamps.length - 1;
  let answer = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (timestamps[mid] <= currentTimeMs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return answer;
};

const isRadioSample = (value: unknown): value is TimedSample<OpenF1TeamRadio> => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeRadio = value as Partial<TimedSample<OpenF1TeamRadio>>;
  return (
    typeof maybeRadio.timestampMs === "number" &&
    typeof maybeRadio.driver_number === "number" &&
    typeof maybeRadio.recording_url === "string"
  );
};

const isSameRadio = (
  currentRadio: TimedSample<OpenF1TeamRadio> | null,
  radio: TimedSample<OpenF1TeamRadio>,
) => {
  if (!currentRadio) {
    return false;
  }
  return (
    currentRadio.timestampMs === radio.timestampMs &&
    currentRadio.driver_number === radio.driver_number &&
    currentRadio.recording_url === radio.recording_url
  );
};

const getClosestEventIndex = (timestamps: number[], currentTimeMs: number): number => {
  if (timestamps.length === 0) {
    return -1;
  }
  const crossedIndex = getCurrentEventIndex(timestamps, currentTimeMs);
  if (crossedIndex < 0) {
    return 0;
  }
  const nextIndex = crossedIndex + 1;
  if (nextIndex >= timestamps.length) {
    return crossedIndex;
  }
  const prevDiff = Math.abs(currentTimeMs - timestamps[crossedIndex]);
  const nextDiff = Math.abs(timestamps[nextIndex] - currentTimeMs);
  return nextDiff < prevDiff ? nextIndex : crossedIndex;
};

const EventsPanelBase = ({
  events,
  startTimeMs,
  currentTimeMs,
  isPlaying,
  radioEnabled,
  isRadioPlaying,
  currentRadio,
  onPlayRadio,
  onStopRadio,
  hasEvents,
  legendCollapsed,
  shortcutsCollapsed,
  onToggleLegendCollapsed,
  onToggleShortcutsCollapsed,
  onSelectEvent,
}: EventsPanelProps) => {
  const activeEventRef = useRef<HTMLElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const timestamps = useMemo(() => events.map((event) => event.timestampMs), [events]);

  const crossedIndex = useMemo(() => {
    return getCurrentEventIndex(timestamps, currentTimeMs);
  }, [timestamps, currentTimeMs]);

  const closestEventIndex = useMemo(() => {
    return getClosestEventIndex(timestamps, currentTimeMs);
  }, [timestamps, currentTimeMs]);

  const activeIndex = useMemo(() => {
    if (closestEventIndex < 0) {
      return -1;
    }
    const distance = Math.abs(currentTimeMs - timestamps[closestEventIndex]);
    return distance <= ACTIVE_EVENT_WINDOW_MS ? closestEventIndex : -1;
  }, [closestEventIndex, currentTimeMs, timestamps]);

  const markerLineIndex = useMemo(() => {
    if (activeIndex >= 0) {
      return -1;
    }
    if (events.length === 0) {
      return -1;
    }
    return Math.min(events.length, Math.max(0, crossedIndex + 1));
  }, [activeIndex, crossedIndex, events.length]);

  useEffect(() => {
    if (!isPlaying || (activeIndex < 0 && markerLineIndex < 0)) {
      return;
    }
    const marker = activeEventRef.current;
    const container = scrollContainerRef.current;
    if (!marker || !container) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const markerTop = markerRect.top - containerRect.top + container.scrollTop;
    const targetTop = container.clientHeight * AUTO_SCROLL_TARGET_RATIO;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScrollTop = Math.max(0, Math.min(maxScroll, markerTop - targetTop));
    container.scrollTo({ top: nextScrollTop, behavior: "auto" });
  }, [isPlaying, activeIndex, markerLineIndex]);

  return (
    <div
      className="flex h-full flex-col gap-3 rounded-xl border border-white/20 bg-white/5 p-4 backdrop-blur-xl"
      data-testid="events-panel"
    >
      <div className="flex items-end justify-between">
        <div className="text-sm font-semibold text-white">Race Events</div>
        <div className="text-[11px] text-white/55">{events.length}</div>
      </div>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-1">
        {events.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">
            Events appear here when replay data is loaded.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((event, index) => {
              const isActive = index === activeIndex;
              const radio = event.type === "radio" && isRadioSample(event.data) ? event.data : null;
              const isCurrentRadio = radio ? isSameRadio(currentRadio, radio) : false;
              const showPause = Boolean(radio && isCurrentRadio && isRadioPlaying);
              return (
                <div key={`${event.timestampMs}-${event.type}-${index}`}>
                  {markerLineIndex === index && (
                    <div
                      ref={activeEventRef}
                      className="h-[2px] w-full rounded bg-[#E10600]"
                      aria-hidden="true"
                    />
                  )}
                  <button
                    ref={isActive ? activeEventRef : null}
                    type="button"
                    onClick={() => onSelectEvent(event.timestampMs)}
                    className={`group relative mt-1.5 w-full rounded-lg border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-red-500/40 bg-red-500/10"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`absolute top-1 bottom-1 left-0 w-[2px] rounded-r ${
                        isActive ? "bg-[#E10600]" : ""
                      }`}
                      style={isActive ? undefined : { backgroundColor: event.color }}
                      aria-hidden="true"
                    />
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-white/60 tabular-nums">
                        {formatTime(event.timestampMs - startTimeMs)}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/45"
                        style={{ color: event.color }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: event.color }}
                          aria-hidden="true"
                        />
                        {event.type}
                      </span>
                    </div>
                    <div className="text-xs leading-snug text-white/80">
                      {event.detail || event.label}
                    </div>
                    {radio && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            if (showPause) {
                              onStopRadio();
                              return;
                            }
                            onPlayRadio(radio);
                          }}
                          disabled={!radioEnabled}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition ${
                            radioEnabled
                              ? "bg-blue-500 text-white hover:bg-blue-400"
                              : "bg-white/10 text-white/40"
                          }`}
                          aria-label={showPause ? "Stop team radio" : "Play team radio"}
                        >
                          {showPause ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                        <div className="flex items-end gap-[2px]" style={{ height: 14 }}>
                          {["20%", "40%", "70%", "45%"].map((height, waveformIndex) => (
                            <span
                              key={`${event.timestampMs}-${waveformIndex}`}
                              className="w-[2px] rounded-sm bg-blue-400 transition-[height] duration-150"
                              style={{ height: showPause ? height : "20%" }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
            {markerLineIndex === events.length && (
              <div
                ref={activeEventRef}
                className="h-[2px] w-full rounded bg-[#E10600]"
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </div>
      <div className="shrink-0">
        <MarkerLegend
          hasEvents={hasEvents}
          legendCollapsed={legendCollapsed}
          onToggleLegendCollapsed={onToggleLegendCollapsed}
          shortcutsCollapsed={shortcutsCollapsed}
          onToggleShortcutsCollapsed={onToggleShortcutsCollapsed}
        />
      </div>
    </div>
  );
};

export const EventsPanel = memo(EventsPanelBase);
