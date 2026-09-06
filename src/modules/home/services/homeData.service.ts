import { buildEventDetailsHref, buildReplayHref } from "../../../app/routing";
import { getArchiveCatalogUrl, loadCatalog, loadManifest, loadReplayCore } from "../../archive";
import type { ArchiveCatalog, ArchiveCatalogSession } from "../../archive/types";
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

const withTimeout = async <T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
) => {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(signal ? AbortSignal.any([controller.signal, signal]) : controller.signal);
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

const fetchJolpica = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
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
        signal,
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

const fetchNews = async (signal?: AbortSignal): Promise<NewsItem[]> => {
  const endpoint = `${CORS_SAFE_RSS_ENDPOINT}?url=${encodeURIComponent(FORMULA1_RSS_URL)}`;
  const response = await withTimeout(
    (signal) => fetch(endpoint, { signal }),
    HOME_REQUEST_TIMEOUT_MS,
    signal,
  );
  if (!response.ok) {
    throw new Error(`News feed request failed: ${response.status}`);
  }
  const xmlText = await response.text();
  return parseRss(xmlText);
};

export const findArchivedMeetingForRound = (
  meetings: OpenF1Meeting[],
  replayRoundByMeeting: Map<number, number>,
  round: number,
) => meetings.find((meeting) => replayRoundByMeeting.get(meeting.meeting_key) === round) ?? null;

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
      const mappedMeeting = findArchivedMeetingForRound(meetings, replayRoundByMeeting, round);
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

const isReplaySessionType = (value: string): value is ReplaySessionType =>
  REPLAY_SESSION_PREFERENCE.includes(value as ReplaySessionType);

export const buildReplaySessionGroupsFromCatalog = (
  catalog: ArchiveCatalog,
): ReplaySessionYearGroup[] => {
  const byYear = new Map<number, ReplaySessionCard[]>();
  for (const entry of catalog.sessions) {
    if (!isReplaySessionType(entry.type)) continue;
    const sessionType = entry.type;
    const cards = byYear.get(entry.year) ?? [];
    cards.push({
      id: `${entry.year}-${entry.meetingKey}-${sessionType}`,
      year: entry.year,
      round: entry.round,
      meetingName: entry.meeting.meeting_name,
      circuitName: entry.meeting.circuit_short_name,
      startTime: entry.session.date_start,
      sessionType,
      detailsHref: buildEventDetailsHref(entry.year, entry.round, sessionType),
      replayHref: buildReplayHref(entry.year, entry.round, sessionType),
    });
    byYear.set(entry.year, cards);
  }
  return [...byYear.entries()]
    .map(([year, sessions]) => ({
      year,
      sessions: sessions.sort(
        (a, b) =>
          b.round - a.round ||
          REPLAY_SESSION_PREFERENCE.indexOf(a.sessionType) -
            REPLAY_SESSION_PREFERENCE.indexOf(b.sessionType),
      ),
    }))
    .sort((a, b) => b.year - a.year);
};

const homeCardFromArchive = (entry: ArchiveCatalogSession): HomeRaceCard => {
  const sessionType = entry.type as ReplaySessionType;
  return {
    id: `${entry.year}-${entry.round}`,
    year: entry.year,
    round: entry.round,
    meetingName: entry.meeting.meeting_name,
    circuitName: entry.meeting.circuit_short_name,
    locality: "",
    country: entry.meeting.country_name,
    startTime: entry.session.date_start,
    status: "completed",
    replay: {
      available: true,
      sessionType,
      detailsHref: buildEventDetailsHref(entry.year, entry.round, sessionType),
      replayHref: buildReplayHref(entry.year, entry.round, sessionType),
    },
  };
};

const preferredArchiveSessions = (sessions: ArchiveCatalogSession[]) => {
  const byMeeting = new Map<number, ArchiveCatalogSession>();
  for (const entry of sessions) {
    if (!isReplaySessionType(entry.type)) continue;
    const current = byMeeting.get(entry.meetingKey);
    if (
      !current ||
      REPLAY_SESSION_PREFERENCE.indexOf(entry.type) <
        REPLAY_SESSION_PREFERENCE.indexOf(current.type as ReplaySessionType)
    ) {
      byMeeting.set(entry.meetingKey, entry);
    }
  }
  return [...byMeeting.values()].sort((a, b) => a.round - b.round);
};

export const buildArchiveDashboardData = (
  catalog: ArchiveCatalog,
  year: number,
): HomeDashboardData => {
  const replaySessionsByYear = buildReplaySessionGroupsFromCatalog(catalog);
  const completedCards = preferredArchiveSessions(
    catalog.sessions.filter((entry) => entry.year === year),
  ).map(homeCardFromArchive);
  const latestArchive = [...catalog.sessions]
    .filter((entry) => isReplaySessionType(entry.type))
    .sort((a, b) => Date.parse(b.session.date_end) - Date.parse(a.session.date_end))[0];
  return {
    year,
    cards: completedCards,
    completedCards,
    upcomingCards: [],
    nextRace: null,
    latestReplayRace:
      completedCards.at(-1) ?? (latestArchive ? homeCardFromArchive(latestArchive) : null),
    replaySessionsByYear,
    totalReplaySessions: replaySessionsByYear.reduce(
      (total, group) => total + group.sessions.length,
      0,
    ),
    standingsContextLabel: buildStandingsContextLabel(completedCards),
    driverStandings: [],
    constructorStandings: [],
    news: [],
    warnings: [],
  };
};

const catalogMaps = (sessions: ArchiveCatalogSession[]) => {
  const replayRoundByMeeting = new Map<number, number>();
  const replaySessionByMeeting = new Map<number, ReplaySessionType>();
  for (const entry of preferredArchiveSessions(sessions)) {
    replayRoundByMeeting.set(entry.meetingKey, entry.round);
    replaySessionByMeeting.set(entry.meetingKey, entry.type as ReplaySessionType);
  }
  return { replayRoundByMeeting, replaySessionByMeeting };
};

const warningMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const loadDashboardSupplement = async (
  catalog: ArchiveCatalog,
  base: HomeDashboardData,
  signal?: AbortSignal,
): Promise<HomeDashboardData> => {
  const warnings: string[] = [];
  const emptyRaces = { MRData: { RaceTable: { Races: [] as JolpicaRace[] } } };
  const [racesPayload, driverStandingsPayload, constructorStandingsPayload, news] =
    await Promise.all([
      fetchJolpica<{ MRData?: { RaceTable?: { Races?: JolpicaRace[] } } }>(
        `${base.year}/races`,
        signal,
      ).catch((error) => {
        warnings.push(warningMessage(error, "Season schedule unavailable"));
        return emptyRaces;
      }),
      fetchJolpica(`${base.year}/driverstandings`, signal).catch((error) => {
        warnings.push(warningMessage(error, "Driver standings unavailable"));
        return {};
      }),
      fetchJolpica(`${base.year}/constructorstandings`, signal).catch((error) => {
        warnings.push(warningMessage(error, "Constructor standings unavailable"));
        return {};
      }),
      fetchNews(signal).catch((error) => {
        warnings.push(warningMessage(error, "News feed unavailable"));
        return [] as NewsItem[];
      }),
    ]);
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");

  const yearSessions = catalog.sessions.filter((entry) => entry.year === base.year);
  const { replayRoundByMeeting, replaySessionByMeeting } = catalogMaps(yearSessions);
  const meetings = preferredArchiveSessions(yearSessions).map((entry) => entry.meeting);
  const cards = buildCards(
    base.year,
    racesPayload.MRData?.RaceTable?.Races ?? [],
    meetings,
    replayRoundByMeeting,
    replaySessionByMeeting,
  );
  const completedCards = cards.filter((card) => card.status === "completed");
  const upcomingCards = cards.filter((card) => card.status !== "completed");
  const latest = [...yearSessions].sort(
    (a, b) => Date.parse(b.session.date_end) - Date.parse(a.session.date_end),
  )[0];
  let drivers: OpenF1Driver[] = [];
  if (latest) {
    try {
      const manifest = await loadManifest(getArchiveCatalogUrl(), latest, { signal });
      drivers = (await loadReplayCore(getArchiveCatalogUrl(), manifest, { signal })).drivers;
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(warningMessage(error, "Driver profiles unavailable"));
    }
  }

  return {
    ...base,
    cards: cards.length ? cards : base.cards,
    completedCards: cards.length ? completedCards : base.completedCards,
    upcomingCards,
    nextRace: upcomingCards[0] ?? null,
    latestReplayRace:
      [...completedCards].reverse().find((card) => card.replay.available) ?? base.latestReplayRace,
    standingsContextLabel: buildStandingsContextLabel(
      cards.length ? completedCards : base.completedCards,
    ),
    driverStandings: enrichDriverStandings(parseDriverStandings(driverStandingsPayload), drivers),
    constructorStandings: enrichConstructorStandings(
      parseConstructorStandings(constructorStandingsPayload),
    ),
    news,
    warnings,
  };
};

export const loadArchiveDashboard = async (year: number, signal?: AbortSignal) => {
  const catalog = await loadCatalog(getArchiveCatalogUrl(), { signal });
  return { catalog, data: buildArchiveDashboardData(catalog, year) };
};

export const getDashboardData = async (year: number): Promise<HomeDashboardData> => {
  const { catalog, data } = await loadArchiveDashboard(year);
  return loadDashboardSupplement(catalog, data);
};
