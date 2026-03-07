import { describe, expect, it } from "bun:test";
import {
  filterReplayableMeetings,
  getReplayableMeetingKeys,
  hasReplayableSessions,
} from "modules/replay/services/telemetry.service";
import type { OpenF1Meeting, OpenF1Session } from "modules/replay/types/openf1.types";

const NOW = Date.parse("2026-03-07T17:14:48Z");

const createMeeting = (
  meeting_name: string,
  overrides: Partial<OpenF1Meeting> = {},
): OpenF1Meeting => ({
  meeting_key: 100,
  meeting_name,
  meeting_official_name: `FORMULA 1 ${meeting_name.toUpperCase()}`,
  year: 2026,
  country_name: "Australia",
  circuit_short_name: "Melbourne",
  date_start: "2026-03-06T01:30:00Z",
  date_end: "2026-03-08T06:00:00Z",
  ...overrides,
});

const createSession = (
  session_type: string,
  overrides: Partial<OpenF1Session> = {},
): OpenF1Session => ({
  session_key: 1,
  meeting_key: 100,
  session_name: session_type,
  session_type,
  date_start: "2026-03-07T05:00:00Z",
  date_end: "2026-03-07T06:00:00Z",
  year: 2026,
  ...overrides,
});

describe("telemetry.service replayability", () => {
  it("marks a year as replayable when only Qualifying has ended", () => {
    expect(hasReplayableSessions([createSession("Qualifying")], NOW)).toBe(true);
  });

  it("does not mark a year as replayable when only Practice or Sprint has ended", () => {
    expect(
      hasReplayableSessions(
        [
          createSession("Practice"),
          createSession("Sprint", { session_key: 2 }),
        ],
        NOW,
      ),
    ).toBe(false);
  });

  it("keeps a meeting when qualifying has ended and the race is still in the future", () => {
    const meetings = [createMeeting("Australian Grand Prix")];
    const sessions = [
      createSession("Qualifying"),
      createSession("Race", {
        session_key: 2,
        date_start: "2026-03-08T04:00:00Z",
        date_end: "2026-03-08T06:00:00Z",
      }),
    ];

    expect(filterReplayableMeetings(meetings, sessions, NOW)).toEqual(meetings);
  });

  it("excludes pre-season meetings even when sessions have ended", () => {
    const meetings = [
      createMeeting("Pre-Season Testing", {
        meeting_official_name: "FORMULA 1 ARAMCO PRE-SEASON TESTING 1 2026",
      }),
    ];
    const sessions = [createSession("Qualifying")];

    expect(filterReplayableMeetings(meetings, sessions, NOW)).toEqual([]);
  });

  it("returns only meeting keys with ended Race or Qualifying sessions", () => {
    const replayableMeetingKeys = getReplayableMeetingKeys(
      [
        createSession("Qualifying", { meeting_key: 100 }),
        createSession("Sprint", { session_key: 2, meeting_key: 101 }),
        createSession("Race", {
          session_key: 3,
          meeting_key: 102,
          date_end: "2026-03-08T06:00:00Z",
        }),
      ],
      NOW,
    );

    expect([...replayableMeetingKeys]).toEqual([100]);
  });
});
