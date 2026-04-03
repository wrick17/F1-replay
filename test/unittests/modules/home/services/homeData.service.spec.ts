import { describe, expect, it } from "bun:test";
import {
  buildReplaySessionGroupsByYear,
  buildStandingsContextLabel,
  enrichConstructorStandings,
  enrichDriverStandings,
  getRaceStatus,
  selectReplaySessionType,
} from "modules/home/services/homeData.service";
import type { OpenF1Meeting, OpenF1Session } from "modules/replay/types/openf1.types";

const createSession = (
  session_type: string,
  date_end: string,
  meeting_key = 1,
): OpenF1Session => ({
  session_key: Math.random(),
  meeting_key,
  session_name: session_type,
  session_type,
  date_start: "2026-03-07T05:00:00Z",
  date_end,
  year: 2026,
});

const createMeeting = (meeting_key: number, year: number, date_start: string): OpenF1Meeting => ({
  meeting_key,
  meeting_name: `Round ${meeting_key}`,
  meeting_official_name: `Round ${meeting_key} Grand Prix`,
  year,
  country_name: "Country",
  circuit_short_name: `Circuit ${meeting_key}`,
  date_start,
  date_end: date_start,
});

describe("home data service helpers", () => {
  it("marks past races as completed", () => {
    expect(getRaceStatus("2026-01-01T00:00:00Z", Date.parse("2026-02-01T00:00:00Z"))).toBe(
      "completed",
    );
  });

  it("marks near-term started races as live", () => {
    const raceStart = Date.parse("2026-03-01T12:00:00Z");
    expect(getRaceStatus(new Date(raceStart).toISOString(), raceStart + 30 * 60 * 1000)).toBe("live");
  });

  it("marks future races as upcoming", () => {
    expect(getRaceStatus("2026-12-01T00:00:00Z", Date.parse("2026-02-01T00:00:00Z"))).toBe(
      "upcoming",
    );
  });

  it("picks Race before Sprint and Qualifying", () => {
    const now = Date.parse("2026-03-07T10:00:00Z");
    const selected = selectReplaySessionType(
      [
        createSession("Qualifying", "2026-03-07T06:00:00Z"),
        createSession("Sprint", "2026-03-07T07:00:00Z"),
        createSession("Race", "2026-03-07T08:00:00Z"),
      ],
      now,
    );
    expect(selected).toBe("Race");
  });

  it("ignores sessions that have not ended yet", () => {
    const now = Date.parse("2026-03-07T06:30:00Z");
    const selected = selectReplaySessionType(
      [
        createSession("Race", "2026-03-07T09:00:00Z"),
        createSession("Sprint", "2026-03-07T05:30:00Z"),
      ],
      now,
    );
    expect(selected).toBe("Sprint");
  });

  it("builds standings context from the latest completed round", () => {
    expect(
      buildStandingsContextLabel([
        {
          id: "2026-1",
          year: 2026,
          round: 1,
          meetingName: "Australian Grand Prix",
          circuitName: "Albert Park",
          locality: "Melbourne",
          country: "Australia",
          startTime: "2026-03-08T05:00:00Z",
          status: "completed",
          replay: {
            available: true,
            sessionType: "Race",
            detailsHref: "/2026/1/race",
            replayHref: "/2026/1/race/replay",
          },
        },
        {
          id: "2026-3",
          year: 2026,
          round: 3,
          meetingName: "Japanese Grand Prix",
          circuitName: "Suzuka",
          locality: "Suzuka",
          country: "Japan",
          startTime: "2026-03-29T05:00:00Z",
          status: "completed",
          replay: {
            available: true,
            sessionType: "Race",
            detailsHref: "/2026/3/race",
            replayHref: "/2026/3/race/replay",
          },
        },
      ]),
    ).toBe("After Round 3: Japanese Grand Prix");
  });

  it("groups replay sessions by year and sorts years and sessions descending", () => {
    const now = Date.parse("2026-12-31T00:00:00Z");
    const groups = buildReplaySessionGroupsByYear(
      [
        {
          year: 2025,
          meetings: [
            createMeeting(51, 2025, "2025-03-07T00:00:00Z"),
            createMeeting(52, 2025, "2025-03-21T00:00:00Z"),
          ],
          sessions: [
            createSession("Race", "2025-03-07T10:00:00Z", 51),
            createSession("Qualifying", "2025-03-06T10:00:00Z", 51),
            createSession("Race", "2025-03-21T10:00:00Z", 52),
          ].map((session) => ({ ...session, year: 2025 })),
        },
        {
          year: 2026,
          meetings: [createMeeting(61, 2026, "2026-03-07T00:00:00Z")],
          sessions: [createSession("Race", "2026-03-07T10:00:00Z", 61)],
        },
      ],
      now,
    );

    expect(groups.map((group) => group.year)).toEqual([2026, 2025]);
    expect(groups[0]?.sessions[0]?.detailsHref).toBe("/2026/1/race");
    expect(groups[0]?.sessions[0]?.replayHref).toBe("/2026/1/race/replay");
    expect(groups[1]?.sessions.map((session) => session.id)).toEqual([
      "2025-52-Race",
      "2025-51-Race",
      "2025-51-Qualifying",
    ]);
  });

  it("enriches standings with driver headshots and team logos", () => {
    const drivers = [
      {
        driver_number: 12,
        full_name: "George Russell",
        name_acronym: "RUS",
        broadcast_name: "G RUSSELL",
        team_name: "Mercedes AMG Petronas F1 Team",
        team_colour: "00D2BE",
        headshot_url: "https://example.com/rus.png",
      },
    ];

    const enrichedDrivers = enrichDriverStandings(
      [
        {
          id: "russell",
          position: 1,
          points: 99,
          wins: 2,
          name: "George Russell",
          shortName: "RUS",
          team: "Mercedes",
          imageUrl: "",
          teamLogoUrl: "",
        },
      ],
      drivers,
    );

    expect(enrichedDrivers[0]?.imageUrl).toBe("https://example.com/rus.png");
    expect(enrichedDrivers[0]?.teamLogoUrl).toContain("mercedes-logo");

    const enrichedConstructors = enrichConstructorStandings([
      {
        id: "mercedes",
        position: 1,
        points: 150,
        wins: 4,
        name: "Mercedes AMG Petronas",
        logoUrl: "",
      },
    ]);
    expect(enrichedConstructors[0]?.name).toBe("Mercedes");
    expect(enrichedConstructors[0]?.logoUrl).toContain("mercedes-logo");
  });
});
