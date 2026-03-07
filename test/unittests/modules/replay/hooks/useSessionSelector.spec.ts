import { describe, expect, it } from "bun:test";
import {
  getAvailableSessionTypes,
  getCorrectedYear,
  getFallbackSessionType,
  isValidSessionType,
} from "modules/replay/hooks/useSessionSelector";
import type { OpenF1Session } from "modules/replay/types/openf1.types";

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

describe("useSessionSelector helpers", () => {
  it("rejects Sprint as a valid session type", () => {
    expect(isValidSessionType("Sprint")).toBe(false);
    expect(isValidSessionType("Race")).toBe(true);
    expect(isValidSessionType("Qualifying")).toBe(true);
  });

  it("falls back to Qualifying when it is the first available supported session", () => {
    const fallback = getFallbackSessionType([
      createSession("Practice"),
      createSession("Qualifying", { session_key: 2 }),
      createSession("Sprint", { session_key: 3 }),
    ]);

    expect(fallback).toBe("Qualifying");
  });

  it("filters Sprint out of the supported session list", () => {
    const available = getAvailableSessionTypes([
      createSession("Sprint"),
      createSession("Race", { session_key: 2 }),
      createSession("Qualifying", { session_key: 3 }),
    ]);

    expect(available).toEqual(["Race", "Qualifying"]);
  });

  it("does not correct the year when 2026 is already available", () => {
    expect(getCorrectedYear([2026, 2025, 2024], 2026)).toBeNull();
  });
});
