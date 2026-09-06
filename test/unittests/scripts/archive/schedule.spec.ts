import { describe, expect, it } from "bun:test";
import {
  calendarYears,
  decideSchedule,
  EXPECTED_DURATION_MS,
  type JolpicaRace,
  parseCalendar,
  RETRY_WINDOW_MS,
  scheduledSessions,
} from "../../../../scripts/archive/schedule";

const race = {
  season: "2026",
  round: "2",
  date: "2026-03-22",
  time: "07:00:00Z",
  Qualifying: { date: "2026-03-21", time: "07:00:00Z" },
} satisfies JolpicaRace;

describe("archive publishing schedule", () => {
  it("waits 90 minutes after qualifying and 150 minutes after the race start", () => {
    const qualifyingReady = Date.parse("2026-03-21T07:00:00Z") + EXPECTED_DURATION_MS.Qualifying;
    const raceReady = Date.parse("2026-03-22T07:00:00Z") + EXPECTED_DURATION_MS.Race;

    expect(decideSchedule([race], [], qualifyingReady - 1).publish).toBe(false);
    expect(decideSchedule([race], [], qualifyingReady).missing).toEqual(["2026/2/Qualifying"]);
    const afterQualifying = [{ year: 2026, round: 2, type: "Qualifying" }];
    expect(decideSchedule([race], afterQualifying, raceReady - 1).publish).toBe(false);
    expect(decideSchedule([race], afterQualifying, raceReady).missing).toEqual(["2026/2/Race"]);
  });

  it("uses the exact Sprint field and excludes sprint qualifying variants", () => {
    const sprintRace = {
      ...race,
      Sprint: { date: "2026-03-21", time: "03:00:00Z" },
      SprintQualifying: { date: "2026-03-20", time: "07:00:00Z" },
      SprintShootout: { date: "2026-03-20", time: "08:00:00Z" },
    } satisfies JolpicaRace;

    expect(scheduledSessions([sprintRace]).map((session) => session.type)).toEqual([
      "Qualifying",
      "Sprint",
      "Race",
    ]);
    const sprintReady = Date.parse("2026-03-21T03:00:00Z") + EXPECTED_DURATION_MS.Sprint;
    expect(decideSchedule([sprintRace], [], sprintReady - 1).missing).toEqual([]);
    expect(decideSchedule([sprintRace], [], sprintReady).missing).toEqual(["2026/2/Sprint"]);
  });

  it("retries missing sessions for 48 hours and stops when the catalog is complete", () => {
    const isolatedRace = { ...race, date: "2026-04-22" };
    const ready = Date.parse("2026-03-21T07:00:00Z") + EXPECTED_DURATION_MS.Qualifying;
    expect(decideSchedule([isolatedRace], [], ready + RETRY_WINDOW_MS).publish).toBe(true);
    expect(decideSchedule([isolatedRace], [], ready + RETRY_WINDOW_MS + 1).publish).toBe(false);
    expect(
      decideSchedule([race], [{ year: 2026, round: 2, type: "Qualifying" }], ready).publish,
    ).toBe(false);
  });

  it("publishes when a due session cannot be compared with the snapshot", () => {
    const ready = Date.parse("2026-03-21T07:00:00Z") + EXPECTED_DURATION_MS.Qualifying;
    expect(decideSchedule([race], null, ready)).toEqual({
      publish: true,
      reason: "catalog-snapshot-unavailable",
      missing: ["2026/2/Qualifying"],
    });
  });

  it("fails on missing calendar times and forces daily or manual backfills", () => {
    expect(() => scheduledSessions([{ ...race, Qualifying: { date: "2026-03-21" } }])).toThrow(
      "missing date or time",
    );
    expect(decideSchedule([], null, Date.now(), true)).toEqual({
      publish: true,
      reason: "forced",
      missing: [],
    });
    expect(() => parseCalendar({ MRData: { RaceTable: { Races: [] } } })).toThrow("missing races");
    expect(() => parseCalendar({ MRData: { RaceTable: { Races: [null] } } })).toThrow("malformed");
  });

  it("includes the prior year only during the 48-hour rollover window", () => {
    expect(calendarYears(Date.parse("2027-01-02T23:59:59Z"))).toEqual([2026, 2027]);
    expect(calendarYears(Date.parse("2027-01-03T00:00:00.001Z"))).toEqual([2027]);
  });
});
