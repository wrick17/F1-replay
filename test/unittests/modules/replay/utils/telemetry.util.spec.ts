import { describe, expect, it } from "bun:test";
import {
  findSampleAtTime,
  getCurrentLap,
  getCurrentStint,
  normalizePositions,
  withTimestamp,
} from "modules/replay/utils/telemetry.util";

describe("telemetry.util", () => {
  it("adds timestamps to samples", () => {
    const samples = withTimestamp([{ date: "2024-01-01T00:00:00Z" }]);
    expect(samples[0]?.timestampMs).toBeGreaterThan(0);
  });

  it("finds sample at time", () => {
    const samples = [
      { timestampMs: 1000 },
      { timestampMs: 2000 },
      { timestampMs: 3000 },
    ];
    expect(findSampleAtTime(samples, 2500)?.timestampMs).toBe(2000);
  });

  it("normalizes positions", () => {
    const { normalized } = normalizePositions([
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ]);
    expect(normalized.length).toBe(2);
  });

  it("derives lap and stint", () => {
    const laps = [
      { lap_number: 1, timestampMs: 1000 },
      { lap_number: 2, timestampMs: 2000 },
    ];
    expect(getCurrentLap(laps, 1500)).toBe(1);
    const stint = getCurrentStint(
      [{ driver_number: 1, compound: "SOFT", lap_start: 1, lap_end: 3 }],
      2,
    );
    expect(stint?.compound).toBe("SOFT");
  });
});
