import { describe, expect, it } from "bun:test";
import type { ArchiveCatalog, ArchiveCatalogSession } from "modules/archive/types";
import {
  byNewestSession,
  summarizeArchive,
} from "modules/ops/services/opsDashboard.service";

const makeSession = (
  overrides: Partial<ArchiveCatalogSession> = {},
): ArchiveCatalogSession => ({
  year: 2026,
  round: 3,
  sessionKey: 123,
  meetingKey: 999,
  type: "Race",
  meeting: {
    meeting_key: 999,
    meeting_name: "Japanese Grand Prix",
    meeting_official_name: "FORMULA 1 JAPANESE GRAND PRIX",
    year: 2026,
    country_name: "Japan",
    circuit_short_name: "Suzuka",
    date_start: "2026-03-27T00:00:00Z",
    date_end: "2026-03-29T08:00:00Z",
  },
  session: {
    session_key: 123,
    meeting_key: 999,
    session_name: "Race",
    session_type: "Race",
    date_start: "2026-03-29T05:00:00Z",
    date_end: "2026-03-29T07:00:00Z",
    year: 2026,
  },
  status: { replay: "ready", car: "ready" },
  manifest: { url: `objects/${"a".repeat(64)}.json`, sha256: "a".repeat(64), bytes: 1 },
  ...overrides,
});

describe("ops archive dashboard", () => {
  it("summarizes catalog inventory without double-counting meetings", () => {
    const catalog: ArchiveCatalog = {
      schemaVersion: 2,
      updatedAt: "2026-03-29T08:00:00Z",
      sessions: [
        makeSession(),
        makeSession({
          sessionKey: 124,
          type: "Qualifying",
          status: { replay: "ready", car: "unavailable" },
        }),
        makeSession({ year: 2025, round: 1, sessionKey: 50, meetingKey: 800 }),
      ],
    };

    expect(summarizeArchive(catalog)).toEqual({
      seasons: 2,
      meetings: 2,
      sessions: 3,
      carReady: 2,
    });
  });

  it("orders the newest season, round, and session first", () => {
    const sessions = [
      makeSession({ year: 2025, round: 24, sessionKey: 1 }),
      makeSession({ round: 2, sessionKey: 2 }),
      makeSession({ round: 3, sessionKey: 3 }),
    ].sort(byNewestSession);

    expect(sessions.map((session) => session.sessionKey)).toEqual([3, 2, 1]);
  });
});
