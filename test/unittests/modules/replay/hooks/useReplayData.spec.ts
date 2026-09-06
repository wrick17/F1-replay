import { describe, expect, it } from "bun:test";
import {
  buildReplayWindowData,
  getReplayChunkIndex,
  getReplayWindowIndexes,
  projectCatalogSession,
  useReplayData,
} from "modules/replay/hooks/useReplayData";
import type { ArchiveCatalogSession } from "modules/archive/types";
import { getAvailableSessionTypes } from "modules/replay/hooks/useSessionSelector";
import type { ReplaySessionData } from "modules/replay/types/openf1.types";

describe("useReplayData", () => {
  it("exports a hook", () => {
    expect(typeof useReplayData).toBe("function");
  });

  it("keeps the selected location chunk and at most one neighbor on each side", () => {
    expect(getReplayWindowIndexes(0, 6)).toEqual([0, 1]);
    expect(getReplayWindowIndexes(3, 6)).toEqual([2, 3, 4]);
    expect(getReplayWindowIndexes(5, 6)).toEqual([4, 5]);
  });

  it("selects the next chunk when the session starts before sparse location coverage", () => {
    const chunks = [
      { startMs: 600, endMs: 700 },
      { startMs: 900, endMs: 1000 },
    ] as never;
    expect(getReplayChunkIndex(chunks, 0)).toBe(0);
    expect(getReplayChunkIndex(chunks, 800)).toBe(1);
    expect(getReplayChunkIndex(chunks, 1200)).toBe(1);
  });

  it("deduplicates interpolation guards when adjacent chunks are combined", () => {
    const core = {
      telemetryByDriver: {
        1: { locations: [], positions: [], stints: [], laps: [] },
      },
    } as unknown as ReplaySessionData;
    const sample = (timestampMs: number) => ({ timestampMs, driver_number: 1 });
    const data = buildReplayWindowData(core, [
      { index: 0, locations: { 1: [sample(100), sample(200)] } },
      { index: 1, locations: { 1: [sample(200), sample(300)] } },
    ] as never);

    expect(data.telemetryByDriver[1].locations.map((entry) => entry.timestampMs)).toEqual([
      100, 200, 300,
    ]);
  });

  it("rejects location samples for drivers absent from the core", () => {
    const core = {
      telemetryByDriver: {
        1: { locations: [], positions: [], stints: [], laps: [] },
      },
    } as unknown as ReplaySessionData;
    expect(() =>
      buildReplayWindowData(core, [
        { index: 0, locations: { 99: [{ timestampMs: 100, driver_number: 99 }] } },
      ] as never),
    ).toThrow("unknown driver 99");
  });

  it("projects exact catalog types for sprint weekends", () => {
    const catalogSession = (type: "Race" | "Sprint") =>
      ({
        type,
        session: {
          session_key: type === "Race" ? 1 : 2,
          meeting_key: 10,
          session_name: type,
          session_type: "Race",
          date_start: "2025-05-03T00:00:00Z",
          date_end: "2025-05-03T01:00:00Z",
          year: 2025,
        },
      }) as ArchiveCatalogSession;
    const sessions = [catalogSession("Sprint"), catalogSession("Race")].map(
      projectCatalogSession,
    );

    expect(getAvailableSessionTypes(sessions)).toEqual(["Sprint", "Race"]);
    expect(sessions.some((session) => session.session_type === "Sprint")).toBe(true);
  });
});
