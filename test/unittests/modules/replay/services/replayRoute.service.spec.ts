import { describe, expect, it } from "bun:test";
import { pickPreferredReplaySessionType } from "modules/replay/services/replayRoute.service";
import type { OpenF1Session } from "modules/replay/types/openf1.types";

const session = (session_type: string): OpenF1Session => ({
  session_key: 1,
  meeting_key: 10,
  session_name: session_type,
  session_type,
  date_start: "2026-01-01T00:00:00Z",
  date_end: "2026-01-01T01:00:00Z",
  year: 2026,
});

describe("replay route service", () => {
  it("prefers race over other replay session types", () => {
    expect(pickPreferredReplaySessionType([session("Qualifying"), session("Race")])).toBe("Race");
  });

  it("falls back to sprint when race does not exist", () => {
    expect(pickPreferredReplaySessionType([session("Sprint"), session("Qualifying")])).toBe(
      "Sprint",
    );
  });

  it("returns null when no supported session exists", () => {
    expect(pickPreferredReplaySessionType([session("Practice 1")])).toBeNull();
  });
});
