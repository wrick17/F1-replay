import { buildEventDetailsHref, buildReplayHref } from "../../../app/routing";
import { fetchOpenF1 } from "../../replay/api/openf1.client";
import {
  filterReplayableMeetings,
  filterReplayableSessions,
} from "../../replay/services/telemetry.service";
import type { OpenF1Driver, OpenF1Meeting, OpenF1Session } from "../../replay/types/openf1.types";
import { getTeamDisplayName, getTeamLogoUrl } from "../../replay/utils/teamBranding.util";
import type {
  ConstructorStandingsEntry,
  HomeDashboardData,
  HomeRaceCard,
  HomeRaceStatus,
  NewsItem,
  ReplaySessionCard,
  ReplaySessionType,
  ReplaySessionYearGroup,
  StandingsEntry,
} from "../types/home.types";

const JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1";
const FORMULA1_RSS_URL = "https://www.formula1.com/en/latest/all.xml";
const CORS_SAFE_RSS_ENDPOINT = "https://api.allorigins.win/raw";
const REPLAY_SESSION_PREFERENCE: ReplaySessionType[] = ["Race", "Sprint", "Qualifying"];
const LIVE_WINDOW_MS = 1000 * 60 * 90;
const HOME_REQUEST_TIMEOUT_MS = 6000;
const MIN_REPLAY_YEAR = 2023;

type ReplayYearData = {
  year: number;
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
};

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
};

type JolpicaDriverStanding = {
  position?: string;
  points?: string;
  wins?: string;
  Driver?: {
    driverId?: string;
    givenName?: string;
    familyName?: string;
    code?: string;
  };
  Constructors?: Array<{ name?: string }>;
};

type JolpicaConstructorStanding = {
  position?: string;
  points?: string;
  wins?: string;
  Constructor?: {
    constructorId?: string;
    name?: string;
  };
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

const safeNumber = (value: string | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const withTimeout = async <T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number) => {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    globalThis.clearTimeout(timerId);
  }
};

export const getRaceStatus = (startTime: string, now = Date.now()): HomeRaceStatus => {
  const startMs = Date.parse(startTime);
  if (!Number.isFinite(startMs)) {
    return "upcoming";
  }
  if (startMs <= now && now - startMs <= LIVE_WINDOW_MS) {
    return "live";
  }
  if (startMs <= now) {
    return "completed";
  }
  return "upcoming";
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

export const selectReplaySessionType = (
  sessions: OpenF1Session[],
  now: number,
): ReplaySessionType | null => {
  const replayable = filterReplayableSessions(sessions, now);
  for (const preferred of REPLAY_SESSION_PREFERENCE) {
    if (replayable.some((session) => session.session_type === preferred)) {
      return preferred;
    }
  }
  return null;
};

const buildReplayMaps = (meetings: OpenF1Meeting[], sessions: OpenF1Session[], now: number) => {
  const replayableMeetings = [...filterReplayableMeetings(meetings, sessions, now)].sort(
    (a, b) => Date.parse(a.date_start) - Date.parse(b.date_start),
  );

  const replayRoundByMeeting = new Map<number, number>();
  replayableMeetings.forEach((meeting, index) => {
    replayRoundByMeeting.set(meeting.meeting_key, index + 1);
  });

  const replaySessionByMeeting = new Map<number, ReplaySessionType>();
  for (const meeting of replayableMeetings) {
    const sessionType = selectReplaySessionType(
      sessions.filter((session) => session.meeting_key === meeting.meeting_key),
      now,
    );
    if (sessionType) {
      replaySessionByMeeting.set(meeting.meeting_key, sessionType);
    }
  }

  return { replayRoundByMeeting, replaySessionByMeeting, replayableMeetings };
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

const parseDriverStandings = (payload: unknown): StandingsEntry[] => {
  const standings =
    (
      payload as {
        MRData?: {
          StandingsTable?: {
            StandingsLists?: Array<{ DriverStandings?: JolpicaDriverStanding[] }>;
          };
        };
      }
    )?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];

  return standings.map((entry) => {
    const firstName = entry.Driver?.givenName ?? "";
    const lastName = entry.Driver?.familyName ?? "";
    return {
      id: entry.Driver?.driverId ?? `${firstName}-${lastName}`,
      position: safeNumber(entry.position),
      points: safeNumber(entry.points),
      wins: safeNumber(entry.wins),
      name: `${firstName} ${lastName}`.trim(),
      shortName:
        entry.Driver?.code ?? `${firstName.slice(0, 1)}${lastName.slice(0, 2)}`.toUpperCase(),
      team: entry.Constructors?.[0]?.name ?? "Team",
      imageUrl: createDriverFallbackImage(`${firstName} ${lastName}`.trim() || "Driver"),
      teamLogoUrl: createTeamFallbackLogo(entry.Constructors?.[0]?.name ?? "Team"),
    };
  });
};

const parseConstructorStandings = (payload: unknown): ConstructorStandingsEntry[] => {
  const standings =
    (
      payload as {
        MRData?: {
          StandingsTable?: {
            StandingsLists?: Array<{ ConstructorStandings?: JolpicaConstructorStanding[] }>;
          };
        };
      }
    )?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];

  return standings.map((entry) => ({
    id: entry.Constructor?.constructorId ?? entry.Constructor?.name ?? "constructor",
    position: safeNumber(entry.position),
    points: safeNumber(entry.points),
    wins: safeNumber(entry.wins),
    name: entry.Constructor?.name ?? "Constructor",
    logoUrl: createTeamFallbackLogo(entry.Constructor?.name ?? "Constructor"),
  }));
};

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

const findMatchingDriver = (
  entry: Pick<StandingsEntry, "name" | "shortName">,
  lookup: DriverLookup,
) => {
  const normalizedName = normalizePersonName(entry.name);
  const exact = lookup.byName.get(normalizedName);
  if (exact) {
    return exact;
  }
  const acronym = lookup.byAcronym.get(entry.shortName.toUpperCase());
  if (acronym) {
    return acronym;
  }
  const lastName = normalizedName.split(" ").at(-1) ?? "";
  if (!lastName) {
    return null;
  }
  const lastNameMatches = lookup.byLastName.get(lastName) ?? [];
  return lastNameMatches[0] ?? null;
};

export const enrichDriverStandings = (standings: StandingsEntry[], drivers: OpenF1Driver[]) => {
  const lookup = buildDriverLookup(drivers);
  return standings.map((entry) => {
    const matched = findMatchingDriver(entry, lookup);
    const teamName = getTeamDisplayName(matched?.team_name ?? entry.team);
    return {
      ...entry,
      team: teamName,
      imageUrl: matched?.headshot_url ?? createDriverFallbackImage(entry.name),
      teamLogoUrl: getTeamLogoUrl(teamName) ?? createTeamFallbackLogo(teamName),
    } satisfies StandingsEntry;
  });
};

export const enrichConstructorStandings = (standings: ConstructorStandingsEntry[]) => {
  return standings.map((entry) => {
    const teamName = getTeamDisplayName(entry.name);
    return {
      ...entry,
      name: teamName,
      logoUrl: getTeamLogoUrl(teamName) ?? createTeamFallbackLogo(teamName),
    } satisfies ConstructorStandingsEntry;
  });
};

const parseRss = (xmlText: string): NewsItem[] => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");
  const items = Array.from(xml.querySelectorAll("item")).slice(0, 8);
  return items
    .map((item, index) => {
      const title = item.querySelector("title")?.textContent?.trim() ?? "";
      const url = item.querySelector("link")?.textContent?.trim() ?? "";
      const summary = item.querySelector("description")?.textContent?.trim() ?? "";
      const publishedAt = item.querySelector("pubDate")?.textContent?.trim() ?? "";
      if (!title || !url) {
        return null;
      }
      return {
        id: `${index}-${url}`,
        title,
        url,
        source: "Formula1.com",
        summary,
        publishedAt,
      };
    })
    .filter((item): item is NewsItem => item !== null);
};

const fetchNews = async (): Promise<NewsItem[]> => {
  const endpoint = `${CORS_SAFE_RSS_ENDPOINT}?url=${encodeURIComponent(FORMULA1_RSS_URL)}`;
  const response = await withTimeout(
    (signal) => fetch(endpoint, { signal }),
    HOME_REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`News feed request failed: ${response.status}`);
  }
  const xmlText = await response.text();
  return parseRss(xmlText);
};

const buildCards = (
  year: number,
  races: JolpicaRace[],
  meetings: OpenF1Meeting[],
  replayRoundByMeeting: Map<number, number>,
  replaySessionByMeeting: Map<number, ReplaySessionType>,
): HomeRaceCard[] => {
  const now = Date.now();

  return races
    .map((race) => {
      const round = safeNumber(race.round, 0);
      const startTime = toRaceDate(race);
      const mappedMeeting = mapRaceToMeeting(race, meetings);
      const replayRound = mappedMeeting
        ? (replayRoundByMeeting.get(mappedMeeting.meeting_key) ?? null)
        : null;
      const replaySession = mappedMeeting
        ? (replaySessionByMeeting.get(mappedMeeting.meeting_key) ?? null)
        : null;
      const replayAvailable = replayRound !== null && replaySession !== null;
      const status = getRaceStatus(startTime, now);

      return {
        id: `${year}-${round}`,
        year,
        round,
        meetingName: race.raceName ?? "Grand Prix",
        circuitName: race.Circuit?.circuitName ?? "Circuit",
        locality: race.Circuit?.Location?.locality ?? "",
        country: race.Circuit?.Location?.country ?? "",
        startTime,
        status,
        replay: {
          available: replayAvailable,
          sessionType: replaySession,
          detailsHref: replayAvailable
            ? buildEventDetailsHref(year, replayRound, replaySession)
            : null,
          replayHref: replayAvailable ? buildReplayHref(year, replayRound, replaySession) : null,
        },
      } satisfies HomeRaceCard;
    })
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
};

export const buildStandingsContextLabel = (completedCards: HomeRaceCard[]): string | null => {
  const latestCompleted = [...completedCards].sort(
    (a, b) => Date.parse(b.startTime) - Date.parse(a.startTime),
  )[0];
  if (!latestCompleted) {
    return null;
  }
  return `After Round ${latestCompleted.round}: ${latestCompleted.meetingName}`;
};

const toReplayYears = (currentYear: number) =>
  Array.from(
    { length: Math.max(0, currentYear - MIN_REPLAY_YEAR + 1) },
    (_, index) => currentYear - index,
  );

export const buildReplaySessionGroupsByYear = (
  replayYears: ReplayYearData[],
  now: number,
): ReplaySessionYearGroup[] => {
  return replayYears
    .map((replayYear) => {
      const replayableMeetings = [
        ...filterReplayableMeetings(replayYear.meetings, replayYear.sessions, now),
      ].sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
      if (!replayableMeetings.length) {
        return null;
      }

      const roundByMeeting = new Map<number, number>();
      replayableMeetings.forEach((meeting, index) => {
        roundByMeeting.set(meeting.meeting_key, index + 1);
      });

      const replayableSessions = filterReplayableSessions(replayYear.sessions, now).filter(
        (session) =>
          roundByMeeting.has(session.meeting_key) &&
          REPLAY_SESSION_PREFERENCE.includes(session.session_type as ReplaySessionType),
      );
      const dedupedSessions = new Map<string, OpenF1Session>();
      replayableSessions.forEach((session) => {
        const key = `${session.meeting_key}-${session.session_type}`;
        const existing = dedupedSessions.get(key);
        if (!existing || Date.parse(session.date_end) > Date.parse(existing.date_end)) {
          dedupedSessions.set(key, session);
        }
      });

      const meetingsByKey = new Map<number, OpenF1Meeting>();
      replayableMeetings.forEach((meeting) => {
        meetingsByKey.set(meeting.meeting_key, meeting);
      });

      const sessions: ReplaySessionCard[] = Array.from(dedupedSessions.values())
        .map((session) => {
          const meeting = meetingsByKey.get(session.meeting_key);
          const round = roundByMeeting.get(session.meeting_key);
          if (!meeting || !round) {
            return null;
          }
          const sessionType = session.session_type as ReplaySessionType;
          return {
            id: `${replayYear.year}-${meeting.meeting_key}-${sessionType}`,
            year: replayYear.year,
            round,
            meetingName: meeting.meeting_name,
            circuitName: meeting.circuit_short_name,
            startTime: session.date_start,
            sessionType,
            detailsHref: buildEventDetailsHref(replayYear.year, round, sessionType),
            replayHref: buildReplayHref(replayYear.year, round, sessionType),
          } satisfies ReplaySessionCard;
        })
        .filter((session): session is ReplaySessionCard => session !== null)
        .sort((a, b) => {
          if (a.round !== b.round) {
            return b.round - a.round;
          }
          const sessionDiff =
            REPLAY_SESSION_PREFERENCE.indexOf(a.sessionType) -
            REPLAY_SESSION_PREFERENCE.indexOf(b.sessionType);
          if (sessionDiff !== 0) {
            return sessionDiff;
          }
          return Date.parse(b.startTime) - Date.parse(a.startTime);
        });

      if (!sessions.length) {
        return null;
      }

      return {
        year: replayYear.year,
        sessions,
      } satisfies ReplaySessionYearGroup;
    })
    .filter((group): group is ReplaySessionYearGroup => group !== null)
    .sort((a, b) => b.year - a.year);
};

export const getDashboardData = async (year: number): Promise<HomeDashboardData> => {
  const warnings: string[] = [];
  const now = Date.now();
  const currentYear = new Date().getFullYear();

  const [racesPayload, driverStandingsPayload, constructorStandingsPayload] = await Promise.all([
    fetchJolpica<{ MRData?: { RaceTable?: { Races?: JolpicaRace[] } } }>(`${year}/races`),
    fetchJolpica(`${year}/driverstandings`),
    fetchJolpica(`${year}/constructorstandings`),
  ]);

  const [meetingsResult, sessionsResult, newsResult] = await Promise.all([
    withTimeout(
      (signal) => fetchOpenF1<OpenF1Meeting[]>("meetings", { year }, signal, "persist"),
      HOME_REQUEST_TIMEOUT_MS,
    ).catch((error) => {
      warnings.push(error instanceof Error ? error.message : "OpenF1 meetings unavailable");
      return [] as OpenF1Meeting[];
    }),
    withTimeout(
      (signal) => fetchOpenF1<OpenF1Session[]>("sessions", { year }, signal, "persist"),
      HOME_REQUEST_TIMEOUT_MS,
    ).catch((error) => {
      warnings.push(error instanceof Error ? error.message : "OpenF1 sessions unavailable");
      return [] as OpenF1Session[];
    }),
    fetchNews().catch((error) => {
      warnings.push(error instanceof Error ? error.message : "News feed unavailable");
      return [] as NewsItem[];
    }),
  ]);

  const races = racesPayload.MRData?.RaceTable?.Races ?? [];
  const { replayRoundByMeeting, replaySessionByMeeting } = buildReplayMaps(
    meetingsResult,
    sessionsResult,
    now,
  );
  const cards = buildCards(
    year,
    races,
    meetingsResult,
    replayRoundByMeeting,
    replaySessionByMeeting,
  );
  const completedCards = cards.filter((card) => card.status === "completed");
  const upcomingCards = cards.filter((card) => card.status !== "completed");

  const latestReplayRace =
    [...completedCards].reverse().find((card) => card.replay.available) ?? null;
  const nextRace = upcomingCards[0] ?? null;
  const standingsContextLabel = buildStandingsContextLabel(completedCards);
  const latestReplayableSession =
    [...filterReplayableSessions(sessionsResult, now)].sort(
      (a, b) => Date.parse(b.date_end) - Date.parse(a.date_end),
    )[0] ?? null;
  const driversResult = latestReplayableSession
    ? await withTimeout(
        (signal) =>
          fetchOpenF1<OpenF1Driver[]>(
            "drivers",
            { session_key: latestReplayableSession.session_key },
            signal,
            "persist",
          ),
        HOME_REQUEST_TIMEOUT_MS,
      ).catch(() => [] as OpenF1Driver[])
    : [];

  const replayYears = toReplayYears(currentYear);
  const replayYearLookups = await Promise.all(
    replayYears.map(async (replayYear) => {
      if (replayYear === year) {
        return {
          year: replayYear,
          meetings: meetingsResult,
          sessions: sessionsResult,
        } satisfies ReplayYearData;
      }

      const [yearMeetings, yearSessions] = await Promise.all([
        withTimeout(
          (signal) =>
            fetchOpenF1<OpenF1Meeting[]>("meetings", { year: replayYear }, signal, "persist"),
          HOME_REQUEST_TIMEOUT_MS,
        ).catch(() => [] as OpenF1Meeting[]),
        withTimeout(
          (signal) =>
            fetchOpenF1<OpenF1Session[]>("sessions", { year: replayYear }, signal, "persist"),
          HOME_REQUEST_TIMEOUT_MS,
        ).catch(() => [] as OpenF1Session[]),
      ]);

      if (!yearMeetings.length || !yearSessions.length) {
        return null;
      }

      return {
        year: replayYear,
        meetings: yearMeetings,
        sessions: yearSessions,
      } satisfies ReplayYearData;
    }),
  );

  const replaySessionsByYear = buildReplaySessionGroupsByYear(
    replayYearLookups.filter((entry): entry is ReplayYearData => entry !== null),
    now,
  );
  const totalReplaySessions = replaySessionsByYear.reduce(
    (total, group) => total + group.sessions.length,
    0,
  );

  return {
    year,
    cards,
    completedCards,
    upcomingCards,
    nextRace,
    latestReplayRace,
    replaySessionsByYear,
    totalReplaySessions,
    standingsContextLabel,
    driverStandings: enrichDriverStandings(
      parseDriverStandings(driverStandingsPayload),
      driversResult,
    ),
    constructorStandings: enrichConstructorStandings(
      parseConstructorStandings(constructorStandingsPayload),
    ),
    news: newsResult,
    warnings,
  };
};
