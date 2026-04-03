export type ReplaySessionType = "Race" | "Sprint" | "Qualifying";

export type ReplayRouteParams = {
  year: number;
  round: number;
  sessionType: ReplaySessionType;
};

export type AppRoute = "home" | "replay" | "ops-cache" | "event-details" | "legacy-replay-redirect";

export const HOME_PATH = "/";
export const REPLAY_PATH = "/replay";
export const OPS_CACHE_PATH = "/ops/cache";
export const OPS_CACHE_CALLBACK_PATH = "/ops/cache/auth/callback";

const SESSION_SLUG_TO_TYPE: Record<string, ReplaySessionType> = {
  race: "Race",
  sprint: "Sprint",
  qualifying: "Qualifying",
};

const SESSION_TYPE_TO_SLUG: Record<ReplaySessionType, string> = {
  Race: "race",
  Sprint: "sprint",
  Qualifying: "qualifying",
};

const asPositiveInteger = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

export const isReplaySessionType = (value: unknown): value is ReplaySessionType =>
  value === "Race" || value === "Sprint" || value === "Qualifying";

export const toSessionSlug = (sessionType: ReplaySessionType): string =>
  SESSION_TYPE_TO_SLUG[sessionType];

export const fromSessionSlug = (slug: string): ReplaySessionType | null =>
  SESSION_SLUG_TO_TYPE[slug.toLowerCase()] ?? null;

export const hasReplaySearchParams = (search: string): boolean => {
  const params = new URLSearchParams(search);
  const year = asPositiveInteger(params.get("year") ?? "");
  const round = asPositiveInteger(params.get("round") ?? "");
  const sessionType = parseReplaySession(params.get("session"));
  return year !== null && round !== null && sessionType !== null;
};

const parseReplaySession = (raw: string | null): ReplaySessionType | null => {
  if (!raw) {
    return null;
  }
  if (isReplaySessionType(raw)) {
    return raw;
  }
  return fromSessionSlug(raw);
};

export const readLegacyReplayRoute = (search: string): ReplayRouteParams | null => {
  const params = new URLSearchParams(search);
  const year = asPositiveInteger(params.get("year") ?? "");
  const round = asPositiveInteger(params.get("round") ?? "");
  const sessionType = parseReplaySession(params.get("session"));
  if (year === null || round === null || sessionType === null) {
    return null;
  }
  return { year, round, sessionType };
};

const parsePathReplayRoute = (pathname: string): ReplayRouteParams | null => {
  const match = pathname.match(/^\/(\d{4})\/(\d+)\/([a-z]+)\/replay\/?$/i);
  if (!match) {
    return null;
  }
  const year = asPositiveInteger(match[1] ?? "");
  const round = asPositiveInteger(match[2] ?? "");
  const sessionType = fromSessionSlug(match[3] ?? "");
  if (year === null || round === null || sessionType === null) {
    return null;
  }
  return { year, round, sessionType };
};

const parsePathEventRoute = (pathname: string): ReplayRouteParams | null => {
  const match = pathname.match(/^\/(\d{4})\/(\d+)\/([a-z]+)\/?$/i);
  if (!match) {
    return null;
  }
  const year = asPositiveInteger(match[1] ?? "");
  const round = asPositiveInteger(match[2] ?? "");
  const sessionType = fromSessionSlug(match[3] ?? "");
  if (year === null || round === null || sessionType === null) {
    return null;
  }
  return { year, round, sessionType };
};

export const getReplayRouteParams = (pathname: string): ReplayRouteParams | null =>
  parsePathReplayRoute(pathname);

export const getEventRouteParams = (pathname: string): ReplayRouteParams | null =>
  parsePathEventRoute(pathname);

export const buildEventDetailsHref = (
  year: number,
  round: number,
  sessionType: ReplaySessionType,
): string => `/${year}/${round}/${toSessionSlug(sessionType)}`;

export const buildReplayHref = (
  year: number,
  round: number,
  sessionType: ReplaySessionType,
): string => `${buildEventDetailsHref(year, round, sessionType)}/replay`;

export const resolveAppRoute = (pathname: string, search: string): AppRoute => {
  if (pathname === OPS_CACHE_PATH || pathname === OPS_CACHE_CALLBACK_PATH) {
    return "ops-cache";
  }
  if (parsePathReplayRoute(pathname)) {
    return "replay";
  }
  if (parsePathEventRoute(pathname)) {
    return "event-details";
  }
  if (pathname === REPLAY_PATH) {
    return hasReplaySearchParams(search) ? "legacy-replay-redirect" : "replay";
  }
  return "home";
};
