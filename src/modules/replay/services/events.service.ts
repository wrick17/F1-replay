import type {
  OpenF1Driver,
  OpenF1Overtake,
  ReplaySessionData,
  TimedSample,
} from "../types/openf1.types";
import type { TimelineEvent } from "../types/replay.types";

const driverName = (driverNumber: number, drivers: OpenF1Driver[]): string => {
  const driver = drivers.find((d) => d.driver_number === driverNumber);
  return driver?.name_acronym ?? String(driverNumber);
};

const raceControlColor = (category: string, flag?: string | null): string => {
  if (flag) {
    const upper = flag.toUpperCase();
    if (upper.includes("RED")) return "#ef4444";
    if (upper.includes("YELLOW") || upper.includes("DOUBLE")) return "#eab308";
    if (upper.includes("GREEN")) return "#22c55e";
    if (upper.includes("BLUE")) return "#3b82f6";
    if (upper.includes("BLACK")) return "#6b7280";
    if (upper.includes("CHEQUERED")) return "#f5f5f5";
  }
  const upper = category.toUpperCase();
  if (upper.includes("SAFETY") || upper.includes("VSC")) return "#f97316";
  if (upper.includes("DRS")) return "#a855f7";
  return "#a855f7";
};

const raceControlType = (category: string): "flag" | "safety-car" | "race-control" => {
  const upper = category.toUpperCase();
  if (upper.includes("FLAG")) return "flag";
  if (upper.includes("SAFETY") || upper.includes("VSC")) return "safety-car";
  return "race-control";
};

export const buildTimelineEvents = (
  data: ReplaySessionData,
  drivers: OpenF1Driver[],
): TimelineEvent[] => {
  const events: TimelineEvent[] = [];

  for (const radio of data.teamRadios) {
    const name = driverName(radio.driver_number, drivers);
    events.push({
      timestampMs: radio.timestampMs,
      type: "radio",
      color: "#3b82f6",
      label: `Radio: ${name}`,
      detail: `Team radio from ${name}`,
      driverNumbers: [radio.driver_number],
      data: radio,
    });
  }

  for (const overtake of data.overtakes) {
    const overtaking = driverName(overtake.overtaking_driver_number, drivers);
    const overtaken = driverName(overtake.overtaken_driver_number, drivers);
    events.push({
      timestampMs: overtake.timestampMs,
      type: "overtake",
      color: "#22c55e",
      label: `P${overtake.position} ${overtaking} passes ${overtaken}`,
      detail: `${overtaking} overtakes ${overtaken} for P${overtake.position}`,
      driverNumbers: [overtake.overtaking_driver_number, overtake.overtaken_driver_number],
      data: overtake,
    });
  }

  for (const rc of data.raceControl) {
    events.push({
      timestampMs: rc.timestampMs,
      type: raceControlType(rc.category),
      color: raceControlColor(rc.category, rc.flag),
      label: rc.message,
      detail: `${rc.category}: ${rc.message}`,
      driverNumbers: rc.driver_number ? [rc.driver_number] : undefined,
      data: rc,
    });
  }

  for (const pit of data.pits) {
    const name = driverName(pit.driver_number, drivers);
    events.push({
      timestampMs: pit.timestampMs,
      type: "pit",
      color: "#6b7280",
      label: `Pit: ${name}`,
      detail: `${name} pit stop (Lap ${pit.lap_number})`,
      driverNumbers: [pit.driver_number],
      data: pit,
    });
  }

  events.sort((a, b) => a.timestampMs - b.timestampMs);
  return events;
};

export const getActiveOvertakes = (
  overtakes: TimedSample<OpenF1Overtake>[],
  currentTimeMs: number,
  windowMs = 3000,
): OpenF1Overtake[] => {
  const result: OpenF1Overtake[] = [];
  for (let i = overtakes.length - 1; i >= 0; i--) {
    const diff = currentTimeMs - overtakes[i].timestampMs;
    if (diff >= 0 && diff <= windowMs) {
      result.push(overtakes[i]);
    }
    if (diff > windowMs) break;
  }
  return result;
};
