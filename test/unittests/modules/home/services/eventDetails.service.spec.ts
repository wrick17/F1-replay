import { describe, expect, it } from "bun:test";
import type { ReplayRouteParams } from "app/routing";
import { resolveReplayEventDetails } from "modules/home/services/eventDetails.service";
import type {
  OpenF1Driver,
  OpenF1Meeting,
  OpenF1Session,
  OpenF1Stint,
} from "modules/replay/types/openf1.types";

const createMeeting = (meeting_key: number, dateStart: string): OpenF1Meeting => ({
  meeting_key,
  meeting_name: `Round ${meeting_key}`,
  meeting_official_name: `Round ${meeting_key} Grand Prix`,
  year: 2026,
  country_name: "Australia",
  circuit_short_name: `Circuit ${meeting_key}`,
  date_start: dateStart,
  date_end: dateStart,
});

const createSession = (
  meeting_key: number,
  session_type: string,
  date_start: string,
  date_end: string,
): OpenF1Session => ({
  session_key: Number(`${meeting_key}1`),
  meeting_key,
  session_name: session_type,
  session_type,
  date_start,
  date_end,
  year: 2026,
});

describe("resolveReplayEventDetails", () => {
  it("returns event details for a replayable session", () => {
    const route: ReplayRouteParams = { year: 2026, round: 1, sessionType: "Race" };

    const details = resolveReplayEventDetails({
      route,
      races: [
        {
          round: "1",
          raceName: "Australian Grand Prix",
          date: "2026-03-08",
          time: "05:00:00Z",
          Circuit: {
            circuitName: "Albert Park",
            Location: { locality: "Melbourne", country: "Australia" },
          },
        },
      ],
      meetings: [createMeeting(101, "2026-03-08T05:00:00Z")],
      sessions: [
        createSession(101, "Race", "2026-03-08T05:00:00Z", "2026-03-08T07:00:00Z"),
      ],
      now: Date.parse("2026-03-09T00:00:00Z"),
      sessionResults: [],
      drivers: [],
      stints: [],
      laps: [],
    });

    expect(details?.meetingName).toBe("Australian Grand Prix");
    expect(details?.circuitName).toBe("Albert Park");
    expect(details?.locality).toBe("Melbourne");
    expect(details?.replayHref).toBe("/2026/1/race/replay");
    expect(details?.weekendSessions.length).toBe(1);
  });

  it("builds driver and team media URLs for stints and lap metrics", () => {
    const route: ReplayRouteParams = { year: 2026, round: 1, sessionType: "Race" };
    const drivers: OpenF1Driver[] = [
      {
        driver_number: 63,
        full_name: "George RUSSELL",
        name_acronym: "RUS",
        team_name: "Mercedes",
        team_colour: "00D2BE",
        headshot_url: null,
      },
    ];
    const stints: OpenF1Stint[] = [
      { driver_number: 63, compound: "MEDIUM", lap_start: 1, lap_end: 10 },
    ];

    const details = resolveReplayEventDetails({
      route,
      races: [],
      meetings: [createMeeting(101, "2026-03-08T05:00:00Z")],
      sessions: [
        createSession(101, "Race", "2026-03-08T05:00:00Z", "2026-03-08T07:00:00Z"),
      ],
      now: Date.parse("2026-03-09T00:00:00Z"),
      sessionResults: [],
      drivers,
      stints,
      laps: [
        {
          driver_number: 63,
          lap_number: 1,
          date_start: "2026-03-08T05:10:00Z",
          lap_duration: 95.123,
          is_pit_out_lap: false,
          duration_sector_1: 31.1,
          duration_sector_2: 32.2,
          duration_sector_3: 31.8,
          i1_speed: 290,
          i2_speed: 300,
          st_speed: 310,
        },
      ],
    });

    expect(details?.stints[0]?.driverImageUrl.startsWith("data:image/svg+xml")).toBeTrue();
    expect(details?.stints[0]?.teamLogoUrl).toContain("mercedes-logo");
    expect(details?.lapMetrics[0]?.driverImageUrl.startsWith("data:image/svg+xml")).toBeTrue();
    expect(details?.lapMetrics[0]?.teamLogoUrl).toContain("mercedes-logo");
  });

  it("returns null when requested session type is unavailable", () => {
    const route: ReplayRouteParams = { year: 2026, round: 1, sessionType: "Sprint" };

    const details = resolveReplayEventDetails({
      route,
      races: [],
      meetings: [createMeeting(101, "2026-03-08T05:00:00Z")],
      sessions: [
        createSession(101, "Race", "2026-03-08T05:00:00Z", "2026-03-08T07:00:00Z"),
      ],
      now: Date.parse("2026-03-09T00:00:00Z"),
      sessionResults: [],
      drivers: [],
      stints: [],
      laps: [],
    });

    expect(details).toBeNull();
  });
});
