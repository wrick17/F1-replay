import { describe, expect, it } from "bun:test";
import {
  pickLatestCatalogReplay,
  pickPreferredReplaySessionType,
} from "modules/replay/services/replayRoute.service";
import type { ArchiveCatalogSession } from "modules/archive/types";
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

  it("uses the official catalog round for the latest archived replay", () => {
    const entry = {
      year: 2025,
      round: 24,
      type: "Race",
      session: session("Race"),
    } as unknown as ArchiveCatalogSession;
    entry.session.year = 2025;
    entry.session.date_end = "2025-12-07T15:00:00Z";

    expect(pickLatestCatalogReplay([entry])).toEqual({
      year: 2025,
      round: 24,
      sessionType: "Race",
      href: "/2025/24/race/replay",
    });
  });
});
