import { appendFile } from "node:fs/promises";

const JOLPICA_URL = "https://api.jolpi.ca/ergast/f1";
const MINUTE_MS = 60_000;

export const EXPECTED_DURATION_MS = {
  Qualifying: 90 * MINUTE_MS,
  Sprint: 90 * MINUTE_MS,
  Race: 150 * MINUTE_MS,
} as const;
export const RETRY_WINDOW_MS = 48 * 60 * MINUTE_MS;

type SupportedSession = keyof typeof EXPECTED_DURATION_MS;

type SessionTime = {
  date?: string;
  time?: string;
};

export type JolpicaRace = {
  season?: string;
  round?: string;
  date?: string;
  time?: string;
  Qualifying?: SessionTime;
  Sprint?: SessionTime;
  SprintQualifying?: SessionTime;
  SprintShootout?: SessionTime;
};

type CatalogEntry = {
  year: number;
  round: number;
  type: string;
};

type ScheduledSession = CatalogEntry & {
  expectedReadyAt: number;
};

export type ScheduleDecision = {
  publish: boolean;
  reason:
    | "forced"
    | "missing-sessions"
    | "catalog-snapshot-unavailable"
    | "calendar-unavailable"
    | "nothing-due";
  missing: string[];
  error?: string;
};

const identity = ({ year, round, type }: CatalogEntry) => `${year}/${round}/${type}`;

const timestamp = (value: SessionTime, label: string) => {
  if (!value.date || !value.time) throw new Error(`${label} is missing date or time`);
  const parsed = Date.parse(`${value.date}T${value.time}`);
  if (!Number.isFinite(parsed)) throw new Error(`${label} has an invalid date or time`);
  return parsed;
};

const scheduledSession = (
  race: JolpicaRace,
  type: SupportedSession,
  value: SessionTime,
): ScheduledSession => {
  const round = Number(race.round);
  const year = Number(race.season ?? value.date?.slice(0, 4));
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(round) || round < 1) {
    throw new Error(`${type} has an invalid season or round`);
  }
  return {
    year,
    round,
    type,
    expectedReadyAt:
      timestamp(value, `${year} round ${round} ${type}`) + EXPECTED_DURATION_MS[type],
  };
};

export const scheduledSessions = (races: JolpicaRace[]) =>
  races.flatMap((race) => {
    const sessions: ScheduledSession[] = [];
    if (race.Qualifying) sessions.push(scheduledSession(race, "Qualifying", race.Qualifying));
    if (race.Sprint) sessions.push(scheduledSession(race, "Sprint", race.Sprint));
    sessions.push(scheduledSession(race, "Race", { date: race.date, time: race.time }));
    return sessions;
  });

export const decideSchedule = (
  races: JolpicaRace[],
  catalog: CatalogEntry[] | null,
  now: number,
  forced = false,
): ScheduleDecision => {
  if (forced) return { publish: true, reason: "forced", missing: [] };
  const due = scheduledSessions(races).filter(
    (session) => session.expectedReadyAt <= now && now - session.expectedReadyAt <= RETRY_WINDOW_MS,
  );
  if (!due.length) return { publish: false, reason: "nothing-due", missing: [] };

  const published = catalog ? new Set(catalog.map(identity)) : new Set<string>();
  const missing = due.map(identity).filter((session) => !published.has(session));
  if (!missing.length) return { publish: false, reason: "nothing-due", missing: [] };
  return {
    publish: true,
    reason: catalog ? "missing-sessions" : "catalog-snapshot-unavailable",
    missing,
  };
};

export const calendarYears = (now: number) => {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  return now - Date.UTC(year, 0, 1) <= RETRY_WINDOW_MS ? [year - 1, year] : [year];
};

export const parseCalendar = (payload: unknown): JolpicaRace[] => {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Jolpica calendar response is malformed");
  }
  const races = (payload as { MRData?: { RaceTable?: { Races?: unknown } } }).MRData?.RaceTable
    ?.Races;
  if (!Array.isArray(races) || !races.length) {
    throw new Error("Jolpica calendar response is missing races");
  }
  if (races.some((race) => typeof race !== "object" || race === null)) {
    throw new Error("Jolpica calendar response is malformed");
  }
  return races as JolpicaRace[];
};

const fetchCalendar = async (year: number) => {
  const response = await fetch(`${JOLPICA_URL}/${year}/races/`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Jolpica calendar request failed: ${response.status}`);
  return parseCalendar(await response.json());
};

const loadCatalog = async (path: string): Promise<CatalogEntry[] | null> => {
  try {
    const catalog = (await Bun.file(path).json()) as { sessions?: unknown };
    if (!Array.isArray(catalog.sessions)) return null;
    const entries = catalog.sessions.filter(
      (entry): entry is CatalogEntry =>
        typeof entry === "object" &&
        entry !== null &&
        Number.isSafeInteger((entry as CatalogEntry).year) &&
        Number.isSafeInteger((entry as CatalogEntry).round) &&
        typeof (entry as CatalogEntry).type === "string",
    );
    return entries.length === catalog.sessions.length ? entries : null;
  } catch {
    return null;
  }
};

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const main = async () => {
  const forced = process.argv.includes("--force");
  const now = Date.now();
  const catalogPath = argument("--catalog") ?? "public/archive/catalog.json";
  let decision: ScheduleDecision;
  try {
    decision = forced
      ? decideSchedule([], null, now, true)
      : decideSchedule(
          (await Promise.all(calendarYears(now).map(fetchCalendar))).flat(),
          await loadCatalog(catalogPath),
          now,
        );
  } catch (error) {
    decision = {
      publish: false,
      reason: "calendar-unavailable",
      missing: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
  console.log(JSON.stringify(decision));
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `publish=${decision.publish}\n`);
  }
};

if (import.meta.main) await main();
