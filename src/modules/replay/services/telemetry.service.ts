import { ALLOWED_SESSION_TYPES } from "../constants/replay.constants";
import type {
  OpenF1Driver,
  OpenF1Meeting,
  OpenF1Session,
  ReplaySessionData,
  ReplayTelemetry,
} from "../types/openf1.types";
import type { TelemetryRow, TelemetrySummary } from "../types/replay.types";
import { formatTelemetryLabel } from "../utils/format.util";
import { getTeamDisplayName, getTeamInitials, getTeamLogoUrl } from "../utils/teamBranding.util";
import {
  findSampleAtTime,
  getCurrentPosition,
  getCurrentStint,
  groupByDriverNumber,
} from "../utils/telemetry.util";

const MIN_REPLAY_YEAR = 2023;

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

export const dedupeDrivers = (drivers: OpenF1Driver[]) => {
  const seen = new Set<number>();
  return drivers.filter((driver) => {
    if (seen.has(driver.driver_number)) {
      return false;
    }
    seen.add(driver.driver_number);
    return true;
  });
};

export const buildYearOptions = (currentYear: number) =>
  Array.from(
    { length: Math.max(0, currentYear - MIN_REPLAY_YEAR + 1) },
    (_, index) => currentYear - index,
  );

export const isSupportedReplaySession = (
  session: Pick<OpenF1Session, "session_type">,
): session is Pick<OpenF1Session, "session_type"> & {
  session_type: (typeof ALLOWED_SESSION_TYPES)[number];
} => ALLOWED_SESSION_TYPES.includes(session.session_type as (typeof ALLOWED_SESSION_TYPES)[number]);

export const hasEndedReplaySession = (
  session: Pick<OpenF1Session, "session_type" | "date_end">,
  now: number,
) => isSupportedReplaySession(session) && new Date(session.date_end).getTime() <= now;

export const hasReplayableSessions = (sessions: OpenF1Session[], now: number) =>
  sessions.some((session) => hasEndedReplaySession(session, now));

export const filterReplayableSessions = (sessions: OpenF1Session[], now: number) =>
  sessions.filter((session) => hasEndedReplaySession(session, now));

export const getReplayableMeetingKeys = (sessions: OpenF1Session[], now: number) => {
  const replayableMeetingKeys = new Set<number>();
  sessions.forEach((session) => {
    if (hasEndedReplaySession(session, now)) {
      replayableMeetingKeys.add(session.meeting_key);
    }
  });
  return replayableMeetingKeys;
};

export const filterEndedMeetings = (meetings: OpenF1Meeting[], now: number) => {
  return meetings.filter((meeting) => {
    const name = `${meeting.meeting_name} ${meeting.meeting_official_name}`;
    const endMs = new Date(meeting.date_end).getTime();
    return !/pre[- ]season/i.test(name) && endMs <= now;
  });
};

export const filterReplayableMeetings = (
  meetings: OpenF1Meeting[],
  sessions: OpenF1Session[],
  now: number,
) => {
  const replayableMeetingKeys = getReplayableMeetingKeys(sessions, now);
  return meetings.filter((meeting) => {
    const name = `${meeting.meeting_name} ${meeting.meeting_official_name}`;
    return !/pre[- ]season/i.test(name) && replayableMeetingKeys.has(meeting.meeting_key);
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
  _availableEndMs: number,
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
      const teamName = getTeamDisplayName(driver.team_name);
      return {
        driverNumber: driver.driver_number,
        driverName: formatTelemetryLabel(driver),
        driverAcronym: driver.name_acronym,
        headshotUrl: driver.headshot_url ?? null,
        teamName,
        teamLogoUrl: getTeamLogoUrl(teamName),
        teamInitials: getTeamInitials(teamName),
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
