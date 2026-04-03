import { buildReplayHref } from "../../../app/routing";
import { fetchOpenF1 } from "../api/openf1.client";
import type { OpenF1Meeting, OpenF1Session } from "../types/openf1.types";

const MIN_REPLAY_YEAR = 2023;
const PREFERRED_SESSION_ORDER = ["Race", "Sprint", "Qualifying"] as const;
const YEAR_LOOKUP_TIMEOUT_MS = 8000;

export type ReplayRouteSelection = {
  year: number;
  round: number;
  sessionType: (typeof PREFERRED_SESSION_ORDER)[number];
  href: string;
};

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => globalThis.clearTimeout(timerId),
  };
};

const sortMeetingsAsc = (meetings: OpenF1Meeting[]) =>
  [...meetings].sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));

const isReplayableSession = (session: OpenF1Session, now: number) => {
  if (
    !PREFERRED_SESSION_ORDER.includes(
      session.session_type as (typeof PREFERRED_SESSION_ORDER)[number],
    )
  ) {
    return false;
  }
  return Date.parse(session.date_end) <= now;
};

export const pickPreferredReplaySessionType = (sessions: OpenF1Session[]) => {
  for (const preferred of PREFERRED_SESSION_ORDER) {
    if (sessions.some((session) => session.session_type === preferred)) {
      return preferred;
    }
  }
  return null;
};

export const resolveLatestReplaySelection = async (): Promise<ReplayRouteSelection | null> => {
  const currentYear = new Date().getFullYear();
  const now = Date.now();

  for (let year = currentYear; year >= MIN_REPLAY_YEAR; year -= 1) {
    const sessionsLookup = createTimeoutSignal(YEAR_LOOKUP_TIMEOUT_MS);
    let sessions: OpenF1Session[] = [];
    try {
      sessions = await fetchOpenF1<OpenF1Session[]>(
        "sessions",
        { year },
        sessionsLookup.signal,
        "persist",
      );
    } catch {
      sessionsLookup.cleanup();
      continue;
    }
    sessionsLookup.cleanup();

    const replayableSessions = sessions.filter((session) => isReplayableSession(session, now));
    if (!replayableSessions.length) {
      continue;
    }

    const meetingsLookup = createTimeoutSignal(YEAR_LOOKUP_TIMEOUT_MS);
    let meetings: OpenF1Meeting[] = [];
    try {
      meetings = await fetchOpenF1<OpenF1Meeting[]>(
        "meetings",
        { year },
        meetingsLookup.signal,
        "persist",
      );
    } catch {
      meetingsLookup.cleanup();
      continue;
    }
    meetingsLookup.cleanup();

    const replayableMeetingKeySet = new Set(
      replayableSessions.map((session) => session.meeting_key),
    );
    const replayableMeetings = sortMeetingsAsc(
      meetings.filter((meeting) => replayableMeetingKeySet.has(meeting.meeting_key)),
    );
    if (!replayableMeetings.length) {
      continue;
    }

    const latestMeeting = [...replayableMeetings].sort(
      (a, b) => Date.parse(b.date_start) - Date.parse(a.date_start),
    )[0];
    if (!latestMeeting) {
      continue;
    }

    const latestMeetingSessions = replayableSessions.filter(
      (session) => session.meeting_key === latestMeeting.meeting_key,
    );
    const sessionType = pickPreferredReplaySessionType(latestMeetingSessions);
    if (!sessionType) {
      continue;
    }

    const round = replayableMeetings.findIndex(
      (meeting) => meeting.meeting_key === latestMeeting.meeting_key,
    );
    if (round < 0) {
      continue;
    }

    return {
      year,
      round: round + 1,
      sessionType,
      href: buildReplayHref(year, round + 1, sessionType),
    };
  }

  return null;
};
