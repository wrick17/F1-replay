import type { OpenF1Meeting, OpenF1Session } from "../../src/modules/replay/types/openf1.types";
import { filterEndedMeetings } from "../../src/modules/replay/services/telemetry.service";
import type { SupportedSessionType } from "./types";

export const fetchAllMeetings = async (
  fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>,
): Promise<OpenF1Meeting[]> => {
  const years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index);
  const results: OpenF1Meeting[] = [];
  for (const year of years) {
    try {
      const meetings = await fetchOpenF1<OpenF1Meeting[]>("meetings", { year });
      results.push(...meetings);
    } catch {
      // ignore year failures
    }
  }
  return results;
};

export const buildMeetingIndex = (meetings: OpenF1Meeting[]) => {
  const byYear = new Map<number, OpenF1Meeting[]>();
  for (const meeting of meetings) {
    const list = byYear.get(meeting.year) ?? [];
    list.push(meeting);
    byYear.set(meeting.year, list);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);
  years.forEach((year) => {
    const sorted = (byYear.get(year) ?? []).sort(
      (a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
    );
    byYear.set(year, sorted);
  });
  return { byYear, years };
};

export const getEndedMeetings = (meetings: OpenF1Meeting[], now: number) => {
  return filterEndedMeetings(meetings, now);
};

export const findSessionByType = (sessions: OpenF1Session[], sessionType: SupportedSessionType) => {
  return sessions.find((session) => session.session_type === sessionType) ?? null;
};

