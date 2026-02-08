import type { OpenF1Meeting, OpenF1Session } from "../../src/modules/replay/types/openf1.types";
import type { SupportedSessionType } from "./types";
import { toMs } from "./telemetry";

export const filterEndedMeetings = (meetings: OpenF1Meeting[], now: number) => {
  return meetings.filter((meeting) => {
    const name = `${meeting.meeting_name} ${meeting.meeting_official_name}`;
    const endMs = new Date(meeting.date_end).getTime();
    return !/pre[- ]season/i.test(name) && endMs <= now;
  });
};

export const buildMeetingIndex = (meetings: OpenF1Meeting[]) => {
  const byYear = new Map<number, OpenF1Meeting[]>();
  meetings.forEach((meeting) => {
    const list = byYear.get(meeting.year) ?? [];
    list.push(meeting);
    byYear.set(meeting.year, list);
  });
  byYear.forEach((list, year) => {
    list.sort((a, b) => toMs(a.date_start) - toMs(b.date_start));
    byYear.set(year, list);
  });
  const years = [...byYear.keys()].sort((a, b) => b - a);
  return { byYear, years };
};

export const findSessionByType = (
  sessions: OpenF1Session[],
  sessionType: SupportedSessionType,
) => {
  const matches = sessions
    .filter((session) => session.session_type === sessionType)
    .sort((a, b) => toMs(a.date_start) - toMs(b.date_start));
  return matches[matches.length - 1] ?? null;
};

export const fetchAllMeetings = async (
  fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>,
) => {
  try {
    const meetings = await fetchOpenF1<OpenF1Meeting[]>("meetings", {});
    if (meetings.length) {
      return meetings;
    }
  } catch {
    // Fall through to optional year range.
  }

  const minYear = Number(process.env.MIN_YEAR ?? "2023");
  const maxYear = Number(process.env.MAX_YEAR ?? String(new Date().getFullYear()));
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) {
    throw new Error(
      "Failed to fetch meetings without a year. Set MIN_YEAR and MAX_YEAR to continue.",
    );
  }

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  const results = await Promise.all(
    years.map((year) => fetchOpenF1<OpenF1Meeting[]>("meetings", { year })),
  );
  return results.flat();
};
