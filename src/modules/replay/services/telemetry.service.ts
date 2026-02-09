import type {
  OpenF1Driver,
  OpenF1Meeting,
  ReplaySessionData,
  ReplayTelemetry,
} from "../types/openf1.types";
import type { TelemetryRow, TelemetrySummary } from "../types/replay.types";
import { formatTelemetryLabel } from "../utils/format.util";
import {
  findSampleAtTime,
  getCurrentPosition,
  getCurrentStint,
  groupByDriverNumber,
} from "../utils/telemetry.util";

export const getLatestTelemetryTimestamp = (
  telemetryByDriver: Record<number, ReplayTelemetry>,
): number => {
  let latest = 0;
  Object.values(telemetryByDriver).forEach((telemetry) => {
    const lastSample = telemetry.locations[telemetry.locations.length - 1] ?? null;
    if (lastSample && lastSample.timestampMs > latest) {
      latest = lastSample.timestampMs;
    }
  });
  return latest;
};

export const createTelemetryMap = (drivers: OpenF1Driver[]): Record<number, ReplayTelemetry> => {
  return drivers.reduce<Record<number, ReplayTelemetry>>((acc, driver) => {
    acc[driver.driver_number] = {
      locations: [],
      positions: [],
      stints: [],
      laps: [],
    };
    return acc;
  }, {});
};

export const buildYearOptions = (currentYear: number) =>
  Array.from({ length: 6 }, (_, index) => currentYear - index);

export const filterEndedMeetings = (meetings: OpenF1Meeting[], now: number) => {
  return meetings.filter((meeting) => {
    const name = `${meeting.meeting_name} ${meeting.meeting_official_name}`;
    const endMs = new Date(meeting.date_end).getTime();
    return !/pre[- ]season/i.test(name) && endMs <= now;
  });
};

export const chunkAppend = <T extends { driver_number: number }>(
  map: Record<number, T[]>,
  chunk: T[],
) => {
  const grouped = groupByDriverNumber(chunk);
  Object.entries(grouped).forEach(([driverKey, samples]) => {
    const driverNumber = Number(driverKey);
    if (!map[driverNumber]) {
      map[driverNumber] = [];
    }
    map[driverNumber].push(...samples);
  });
};

export const computeTelemetrySummary = (
  data: ReplaySessionData | null,
  availableEndMs: number,
  effectiveEndMs: number,
  sessionStartMs: number,
): TelemetrySummary => {
  if (!data) {
    return {
      sessionLabel: "No session loaded",
      coverageLabel: "--",
      totalDrivers: 0,
    };
  }
  const sessionLabel = `${data.session.session_name} · ${data.session.session_type}`;
  const coverageLabel = `${Math.max(1, Math.floor((effectiveEndMs - sessionStartMs) / 60000))} min`;
  return {
    sessionLabel,
    coverageLabel,
    totalDrivers: data.drivers.length,
  };
};

export const computeTelemetryRows = (
  data: ReplaySessionData | null,
  currentTimeMs: number,
): TelemetryRow[] => {
  if (!data) {
    return [];
  }
  return data.drivers
    .map((driver) => {
      const telemetry = data.telemetryByDriver[driver.driver_number];
      const positions = telemetry?.positions ?? [];
      const laps = telemetry?.laps ?? [];
      const positionSample =
        getCurrentPosition(positions, currentTimeMs) ?? positions[positions.length - 1] ?? null;
      const lapSample = findSampleAtTime(laps, currentTimeMs) ?? laps[laps.length - 1] ?? null;
      const lapNumber = lapSample?.lap_number ?? null;
      const stints = telemetry?.stints ?? [];
      const stint = getCurrentStint(stints, lapNumber);
      const fallbackStint = stint ?? (stints.length > 0 ? stints[stints.length - 1] : null);
      return {
        driverNumber: driver.driver_number,
        driverName: formatTelemetryLabel(driver),
        driverAcronym: driver.name_acronym,
        headshotUrl: driver.headshot_url ?? null,
        lapDurationSeconds: lapSample?.lap_duration ?? null,
        isPitOutLap: lapSample?.is_pit_out_lap ?? null,
        position: positionSample?.position ?? null,
        lap: lapNumber,
        compound: fallbackStint?.compound ?? null,
      };
    })
    .sort((a, b) => {
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position;
    });
};
