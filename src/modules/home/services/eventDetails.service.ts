import {
  buildEventDetailsHref,
  buildReplayHref,
  type ReplayRouteParams,
} from "../../../app/routing";
import { fetchOpenF1 } from "../../replay/api/openf1.client";
import {
  filterReplayableMeetings,
  filterReplayableSessions,
} from "../../replay/services/telemetry.service";
import type {
  OpenF1Driver,
  OpenF1Lap,
  OpenF1Meeting,
  OpenF1Session,
  OpenF1Stint,
} from "../../replay/types/openf1.types";
import { getTeamDisplayName, getTeamLogoUrl } from "../../replay/utils/teamBranding.util";
import type {
  ReplayEventDetails,
  ReplayEventLapMetric,
  ReplayEventResultRow,
  ReplayEventSessionResult,
  ReplayEventSessionSummary,
  ReplayEventStintSummary,
  ReplaySessionType,
} from "../types/home.types";

const JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1";
const HOME_REQUEST_TIMEOUT_MS = 6000;

const SUPPORTED_SESSION_TYPES: ReplaySessionType[] = ["Race", "Sprint", "Qualifying"];

type JolpicaLocation = {
  locality?: string;
  country?: string;
};

type JolpicaCircuit = {
  circuitName?: string;
  Location?: JolpicaLocation;
};

type JolpicaRace = {
  round?: string;
  raceName?: string;
  date?: string;
  time?: string;
  Circuit?: JolpicaCircuit;
  Results?: JolpicaRaceResult[];
  SprintResults?: JolpicaRaceResult[];
  QualifyingResults?: JolpicaQualifyingResult[];
};

type JolpicaRaceResult = {
  position?: string;
  points?: string;
  grid?: string;
  laps?: string;
  status?: string;
  Time?: { time?: string };
  Driver?: {
    givenName?: string;
    familyName?: string;
  };
  Constructor?: {
    name?: string;
  };
};

type JolpicaQualifyingResult = {
  position?: string;
  Driver?: {
    givenName?: string;
    familyName?: string;
  };
  Constructor?: {
    name?: string;
  };
  Q1?: string;
  Q2?: string;
  Q3?: string;
};

type OpenF1LapDetail = OpenF1Lap & {
  duration_sector_1?: number | null;
  duration_sector_2?: number | null;
  duration_sector_3?: number | null;
  i1_speed?: number | null;
  i2_speed?: number | null;
  st_speed?: number | null;
};

type DriverLookup = {
  byName: Map<string, OpenF1Driver>;
  byAcronym: Map<string, OpenF1Driver>;
  byLastName: Map<string, OpenF1Driver[]>;
};

const normalize = (value: string | null | undefined) =>
  (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const toRaceDate = (race: JolpicaRace): string => {
  if (!race.date) {
    return "";
  }
  const time = race.time ?? "00:00:00Z";
  return `${race.date}T${time}`;
};

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeNullableNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const initials = (value: string) =>
  value
    .split(/\s+/)
    .map((part) => part.trim()[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const createDriverFallbackImage = (name: string) =>
  svgDataUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
      <rect width='96' height='96' rx='48' fill='#27272a'/>
      <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='#f4f4f5' font-family='Arial, sans-serif' font-size='32' font-weight='700'>${initials(
        name,
      )}</text>
    </svg>`,
  );

const createTeamFallbackLogo = (team: string) =>
  svgDataUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
      <rect width='96' height='96' rx='18' fill='#18181b'/>
      <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='#f4f4f5' font-family='Arial, sans-serif' font-size='30' font-weight='700'>${initials(
        team,
      )}</text>
    </svg>`,
  );

const normalizePersonName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const buildDriverLookup = (drivers: OpenF1Driver[]) => {
  const byName = new Map<string, OpenF1Driver>();
  const byAcronym = new Map<string, OpenF1Driver>();
  const byLastName = new Map<string, OpenF1Driver[]>();

  drivers.forEach((driver) => {
    const fullName = normalizePersonName(driver.full_name);
    byName.set(fullName, driver);
    if (driver.broadcast_name) {
      byName.set(normalizePersonName(driver.broadcast_name), driver);
    }
    byAcronym.set(driver.name_acronym.toUpperCase(), driver);

    const lastName = fullName.split(" ").at(-1) ?? "";
    if (lastName) {
      const existing = byLastName.get(lastName) ?? [];
      existing.push(driver);
      byLastName.set(lastName, existing);
    }
  });

  return { byName, byAcronym, byLastName } satisfies DriverLookup;
};

const findMatchingDriver = (driverName: string, lookup: DriverLookup, acronym?: string | null) => {
  const normalizedName = normalizePersonName(driverName);
  const exact = lookup.byName.get(normalizedName);
  if (exact) {
    return exact;
  }

  if (acronym) {
    const byAcronym = lookup.byAcronym.get(acronym.toUpperCase());
    if (byAcronym) {
      return byAcronym;
    }
  }

  const lastName = normalizedName.split(" ").at(-1) ?? "";
  if (!lastName) {
    return null;
  }
  const lastNameMatches = lookup.byLastName.get(lastName) ?? [];
  return lastNameMatches[0] ?? null;
};

const average = (values: Array<number | null | undefined>): number | null => {
  const valid = values.filter((value): value is number => Number.isFinite(value ?? NaN));
  if (!valid.length) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const withTimeout = async <T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number) => {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    globalThis.clearTimeout(timerId);
  }
};

const fetchJolpica = async <T>(path: string): Promise<T> => {
  const candidates = [
    `${JOLPICA_BASE_URL}/${path}/?format=json`,
    `${JOLPICA_BASE_URL}/${path}?format=json`,
  ];
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const response = await withTimeout(
        (signal) => fetch(url, { signal }),
        HOME_REQUEST_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw new Error(`Jolpica request failed: ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Failed to fetch Jolpica data");
    }
  }

  throw lastError ?? new Error("Failed to fetch Jolpica data");
};

const mapRaceToMeeting = (race: JolpicaRace, meetings: OpenF1Meeting[]): OpenF1Meeting | null => {
  const raceTime = Date.parse(toRaceDate(race));
  const raceName = normalize(race.raceName);
  const country = normalize(race.Circuit?.Location?.country);
  const locality = normalize(race.Circuit?.Location?.locality);

  const ranked = meetings
    .map((meeting) => {
      const meetingStart = Date.parse(meeting.date_start);
      const dateDiff = Number.isFinite(raceTime)
        ? Math.abs(raceTime - meetingStart)
        : Number.MAX_SAFE_INTEGER;
      const meetingName = normalize(meeting.meeting_name);
      const meetingCountry = normalize(meeting.country_name);
      const meetingCircuit = normalize(meeting.circuit_short_name);
      const nameMatch =
        raceName.length > 0 && (meetingName.includes(raceName) || raceName.includes(meetingName));
      const locationMatch =
        (country.length > 0 && meetingCountry.includes(country)) ||
        (locality.length > 0 && meetingCircuit.includes(locality));
      const score = (nameMatch ? 0 : 1) + (locationMatch ? 0 : 1);

      return { meeting, score, dateDiff };
    })
    .sort((a, b) => a.score - b.score || a.dateDiff - b.dateDiff);

  return ranked[0]?.meeting ?? null;
};

const asDriverName = (givenName?: string, familyName?: string) =>
  [givenName ?? "", familyName ?? ""].join(" ").trim() || "Unknown";

const toResultRowFromRace = (
  entry: JolpicaRaceResult,
  lookup: DriverLookup,
): ReplayEventResultRow => {
  const driverName = asDriverName(entry.Driver?.givenName, entry.Driver?.familyName);
  const matchedDriver = findMatchingDriver(driverName, lookup);
  const teamName = getTeamDisplayName(
    matchedDriver?.team_name ?? entry.Constructor?.name ?? "Unknown",
  );

  return {
    position: safeNullableNumber(entry.position),
    driver: driverName,
    driverImageUrl: matchedDriver?.headshot_url ?? createDriverFallbackImage(driverName),
    team: teamName,
    teamLogoUrl: getTeamLogoUrl(teamName) ?? createTeamFallbackLogo(teamName),
    grid: safeNullableNumber(entry.grid),
    points: safeNullableNumber(entry.points),
    laps: safeNullableNumber(entry.laps),
    status: entry.status ?? null,
    time: entry.Time?.time ?? null,
    q1: null,
    q2: null,
    q3: null,
  };
};

const toResultRowFromQualifying = (
  entry: JolpicaQualifyingResult,
  lookup: DriverLookup,
): ReplayEventResultRow => {
  const driverName = asDriverName(entry.Driver?.givenName, entry.Driver?.familyName);
  const matchedDriver = findMatchingDriver(driverName, lookup);
  const teamName = getTeamDisplayName(
    matchedDriver?.team_name ?? entry.Constructor?.name ?? "Unknown",
  );

  return {
    position: safeNullableNumber(entry.position),
    driver: driverName,
    driverImageUrl: matchedDriver?.headshot_url ?? createDriverFallbackImage(driverName),
    team: teamName,
    teamLogoUrl: getTeamLogoUrl(teamName) ?? createTeamFallbackLogo(teamName),
    grid: null,
    points: null,
    laps: null,
    status: null,
    time: null,
    q1: entry.Q1 ?? null,
    q2: entry.Q2 ?? null,
    q3: entry.Q3 ?? null,
  };
};

const sortResultRows = (rows: ReplayEventResultRow[]) =>
  [...rows].sort((a, b) => {
    if (a.position === null) {
      return 1;
    }
    if (b.position === null) {
      return -1;
    }
    return a.position - b.position;
  });

const buildSessionResults = (
  racePayload: JolpicaRace | null,
  sprintPayload: JolpicaRace | null,
  qualifyingPayload: JolpicaRace | null,
  drivers: OpenF1Driver[],
): ReplayEventSessionResult[] => {
  const sections: ReplayEventSessionResult[] = [];
  const driverLookup = buildDriverLookup(drivers);

  const raceRows = sortResultRows(
    (racePayload?.Results ?? []).map((entry) => toResultRowFromRace(entry, driverLookup)),
  );
  if (raceRows.length) {
    sections.push({
      sessionType: "Race",
      title: "Race Day - Race",
      rows: raceRows,
    });
  }

  const sprintRows = sortResultRows(
    (sprintPayload?.SprintResults ?? []).map((entry) => toResultRowFromRace(entry, driverLookup)),
  );
  if (sprintRows.length) {
    sections.push({
      sessionType: "Sprint",
      title: "Sprint - Sprint Race",
      rows: sprintRows,
    });
  }

  const qualifyingRows = sortResultRows(
    (qualifyingPayload?.QualifyingResults ?? []).map((entry) =>
      toResultRowFromQualifying(entry, driverLookup),
    ),
  );
  if (qualifyingRows.length) {
    sections.push({
      sessionType: "Qualifying",
      title: "Qualifying - Grid Session",
      rows: qualifyingRows,
    });
  }

  return sections;
};

const buildStintSummaries = (
  stints: OpenF1Stint[],
  drivers: OpenF1Driver[],
): ReplayEventStintSummary[] => {
  const driverByNumber = new Map(drivers.map((driver) => [driver.driver_number, driver]));
  const grouped = new Map<number, OpenF1Stint[]>();

  stints.forEach((stint) => {
    const current = grouped.get(stint.driver_number) ?? [];
    current.push(stint);
    grouped.set(stint.driver_number, current);
  });

  return Array.from(grouped.entries())
    .map(([driverNumber, driverStints]) => {
      const driver = driverByNumber.get(driverNumber);
      const driverName = driver?.full_name ?? `Driver #${driverNumber}`;
      const teamName = getTeamDisplayName(driver?.team_name ?? "Unknown");
      const labels = driverStints
        .sort((a, b) => a.lap_start - b.lap_start)
        .map((stint) => `${stint.compound}: L${stint.lap_start}-L${stint.lap_end}`);
      const totalLaps = driverStints.reduce(
        (sum, stint) => sum + Math.max(0, stint.lap_end - stint.lap_start + 1),
        0,
      );

      return {
        driverNumber,
        driver: driverName,
        driverImageUrl: driver?.headshot_url ?? createDriverFallbackImage(driverName),
        acronym: driver?.name_acronym ?? String(driverNumber),
        team: teamName,
        teamLogoUrl: getTeamLogoUrl(teamName) ?? createTeamFallbackLogo(teamName),
        stintCount: driverStints.length,
        totalLaps,
        stintLabels: labels,
      } satisfies ReplayEventStintSummary;
    })
    .sort((a, b) => a.driver.localeCompare(b.driver));
};

const buildLapMetrics = (
  laps: OpenF1LapDetail[],
  drivers: OpenF1Driver[],
): ReplayEventLapMetric[] => {
  const driverByNumber = new Map(drivers.map((driver) => [driver.driver_number, driver]));
  const grouped = new Map<number, OpenF1LapDetail[]>();

  laps.forEach((lap) => {
    const current = grouped.get(lap.driver_number) ?? [];
    current.push(lap);
    grouped.set(lap.driver_number, current);
  });

  return Array.from(grouped.entries())
    .map(([driverNumber, driverLaps]) => {
      const driver = driverByNumber.get(driverNumber);
      const driverName = driver?.full_name ?? `Driver #${driverNumber}`;
      const teamName = getTeamDisplayName(driver?.team_name ?? "Unknown");
      const validLaps = driverLaps.filter((lap) => Number.isFinite(lap.lap_duration));

      const avgLap = average(validLaps.map((lap) => lap.lap_duration));
      const bestLap = validLaps.reduce<number | null>((best, lap) => {
        const value = lap.lap_duration;
        if (!Number.isFinite(value)) {
          return best;
        }
        if (best === null || value < best) {
          return value;
        }
        return best;
      }, null);

      const speedSamples = validLaps.flatMap((lap) => [lap.i1_speed, lap.i2_speed, lap.st_speed]);
      const validSpeeds = speedSamples.filter((speed): speed is number =>
        Number.isFinite(speed ?? NaN),
      );

      return {
        driverNumber,
        driver: driverName,
        driverImageUrl: driver?.headshot_url ?? createDriverFallbackImage(driverName),
        acronym: driver?.name_acronym ?? String(driverNumber),
        team: teamName,
        teamLogoUrl: getTeamLogoUrl(teamName) ?? createTeamFallbackLogo(teamName),
        averageLapSeconds: avgLap,
        bestLapSeconds: bestLap,
        averageSector1Seconds: average(validLaps.map((lap) => lap.duration_sector_1 ?? null)),
        averageSector2Seconds: average(validLaps.map((lap) => lap.duration_sector_2 ?? null)),
        averageSector3Seconds: average(validLaps.map((lap) => lap.duration_sector_3 ?? null)),
        averageSpeedKph: average(validSpeeds),
        peakSpeedKph: validSpeeds.length ? Math.max(...validSpeeds) : null,
      } satisfies ReplayEventLapMetric;
    })
    .sort((a, b) => a.driver.localeCompare(b.driver));
};

type ResolveReplayEventDetailsArgs = {
  route: ReplayRouteParams;
  races: JolpicaRace[];
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
  now: number;
  sessionResults: ReplayEventSessionResult[];
  drivers: OpenF1Driver[];
  stints: OpenF1Stint[];
  laps: OpenF1LapDetail[];
};

export const resolveReplayEventDetails = ({
  route,
  races,
  meetings,
  sessions,
  now,
  sessionResults,
  drivers,
  stints,
  laps,
}: ResolveReplayEventDetailsArgs): ReplayEventDetails | null => {
  const replayableMeetings = [...filterReplayableMeetings(meetings, sessions, now)].sort(
    (a, b) => Date.parse(a.date_start) - Date.parse(b.date_start),
  );

  const targetMeeting = replayableMeetings[route.round - 1] ?? null;
  if (!targetMeeting) {
    return null;
  }

  const targetSession = filterReplayableSessions(sessions, now)
    .filter(
      (session) =>
        session.meeting_key === targetMeeting.meeting_key &&
        session.session_type === route.sessionType,
    )
    .sort((a, b) => Date.parse(b.date_end) - Date.parse(a.date_end))[0];

  if (!targetSession) {
    return null;
  }

  const raceByMeeting = races.find(
    (race) => mapRaceToMeeting(race, replayableMeetings)?.meeting_key === targetMeeting.meeting_key,
  );

  const raceByRound = races.find((race) => safeNumber(race.round, -1) === route.round);
  const race = raceByMeeting ?? raceByRound ?? null;

  const weekendSessions: ReplayEventSessionSummary[] = filterReplayableSessions(sessions, now)
    .filter(
      (session) =>
        session.meeting_key === targetMeeting.meeting_key &&
        SUPPORTED_SESSION_TYPES.includes(session.session_type as ReplaySessionType),
    )
    .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start))
    .map((session) => {
      const sessionType = session.session_type as ReplaySessionType;
      return {
        id: `${session.session_key}-${sessionType}`,
        sessionType,
        sessionName: session.session_name,
        startTime: session.date_start,
        endTime: session.date_end,
        detailsHref: buildEventDetailsHref(route.year, route.round, sessionType),
        replayHref: buildReplayHref(route.year, route.round, sessionType),
      } satisfies ReplayEventSessionSummary;
    });

  return {
    year: route.year,
    round: route.round,
    meetingKey: targetMeeting.meeting_key,
    sessionKey: targetSession.session_key,
    meetingName: race?.raceName ?? targetMeeting.meeting_name,
    officialMeetingName: targetMeeting.meeting_official_name || null,
    circuitName: race?.Circuit?.circuitName ?? targetMeeting.circuit_short_name,
    locality: race?.Circuit?.Location?.locality ?? "",
    country: race?.Circuit?.Location?.country ?? targetMeeting.country_name,
    startTime: targetSession.date_start,
    sessionType: route.sessionType,
    detailsHref: buildEventDetailsHref(route.year, route.round, route.sessionType),
    replayHref: buildReplayHref(route.year, route.round, route.sessionType),
    weekendSessions,
    sessionResults,
    stints: buildStintSummaries(stints, drivers),
    lapMetrics: buildLapMetrics(laps, drivers),
  } satisfies ReplayEventDetails;
};

export const getReplayEventDetails = async (
  route: ReplayRouteParams,
): Promise<ReplayEventDetails | null> => {
  const [
    racesPayload,
    meetings,
    sessions,
    raceResultPayload,
    sprintResultPayload,
    qualifyingPayload,
  ] = await Promise.all([
    fetchJolpica<{ MRData?: { RaceTable?: { Races?: JolpicaRace[] } } }>(`${route.year}/races`),
    fetchOpenF1<OpenF1Meeting[]>("meetings", { year: route.year }, undefined, "persist"),
    fetchOpenF1<OpenF1Session[]>("sessions", { year: route.year }, undefined, "persist"),
    fetchJolpica<{ MRData?: { RaceTable?: { Races?: JolpicaRace[] } } }>(
      `${route.year}/${route.round}/results`,
    ).catch(() => ({ MRData: { RaceTable: { Races: [] } } })),
    fetchJolpica<{ MRData?: { RaceTable?: { Races?: JolpicaRace[] } } }>(
      `${route.year}/${route.round}/sprint`,
    ).catch(() => ({ MRData: { RaceTable: { Races: [] } } })),
    fetchJolpica<{ MRData?: { RaceTable?: { Races?: JolpicaRace[] } } }>(
      `${route.year}/${route.round}/qualifying`,
    ).catch(() => ({ MRData: { RaceTable: { Races: [] } } })),
  ]);

  const now = Date.now();
  const races = racesPayload?.MRData?.RaceTable?.Races ?? [];
  const replayableMeetings = [...filterReplayableMeetings(meetings, sessions, now)].sort(
    (a, b) => Date.parse(a.date_start) - Date.parse(b.date_start),
  );
  const targetMeeting = replayableMeetings[route.round - 1] ?? null;

  const targetSession =
    targetMeeting === null
      ? null
      : (filterReplayableSessions(sessions, now)
          .filter(
            (session) =>
              session.meeting_key === targetMeeting.meeting_key &&
              session.session_type === route.sessionType,
          )
          .sort((a, b) => Date.parse(b.date_end) - Date.parse(a.date_end))[0] ?? null);

  const [drivers, stints, laps] =
    targetSession === null
      ? [[], [], []]
      : await Promise.all([
          fetchOpenF1<OpenF1Driver[]>(
            "drivers",
            { session_key: targetSession.session_key },
            undefined,
            "persist",
          ).catch(() => []),
          fetchOpenF1<OpenF1Stint[]>(
            "stints",
            { session_key: targetSession.session_key },
            undefined,
            "persist",
          ).catch(() => []),
          fetchOpenF1<OpenF1LapDetail[]>(
            "laps",
            { session_key: targetSession.session_key },
            undefined,
            "persist",
          ).catch(() => []),
        ]);

  const raceResultRace = raceResultPayload?.MRData?.RaceTable?.Races?.[0] ?? null;
  const sprintResultRace = sprintResultPayload?.MRData?.RaceTable?.Races?.[0] ?? null;
  const qualifyingRace = qualifyingPayload?.MRData?.RaceTable?.Races?.[0] ?? null;

  return resolveReplayEventDetails({
    route,
    races,
    meetings,
    sessions,
    now,
    sessionResults: buildSessionResults(raceResultRace, sprintResultRace, qualifyingRace, drivers),
    drivers,
    stints,
    laps,
  });
};
