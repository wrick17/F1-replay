import type { OpenF1Meeting, OpenF1Session } from "../../src/modules/replay/types/openf1.types";
import { SupportedSessionType } from "./config";

export const filterEndedMeetings = (meetings: OpenF1Meeting[], now: number) => {
  return meetings.filter((meeting) => {
    const name = `${meeting.meeting_name} ${meeting.meeting_official_name}`;
    const endMs = new Date(meeting.date_end).getTime();
    return !/pre[- ]season/i.test(name) && Number.isFinite(endMs) && endMs <= now;
  });
};

export const fetchAllMeetings = async (
  fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>,
) => {
  try {
    const meetings = await fetchOpenF1<OpenF1Meeting[]>("meetings", {});
    const years = new Set(meetings.map((m) => m.year));
    if (meetings.length && years.size > 1) {
      return meetings;
    }
  } catch {
    // fall through
  }

  // OpenF1's dataset is heavily modern; starting at 2018 is a reasonable default.
  const minYear = 2018;
  const maxYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(0, maxYear - minYear + 1) }, (_, i) => minYear + i);
  const results: OpenF1Meeting[] = [];
  for (const year of years) {
    try {
      const meetings = await fetchOpenF1<OpenF1Meeting[]>("meetings", { year });
      results.push(...meetings);
    } catch {
      // ignore year failures; retry logic lives at call sites
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

export const findSessionByType = (sessions: OpenF1Session[], sessionType: SupportedSessionType) => {
  const matches = sessions
    .filter((s) => s.session_type === sessionType)
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
  return matches[matches.length - 1] ?? null;
};
