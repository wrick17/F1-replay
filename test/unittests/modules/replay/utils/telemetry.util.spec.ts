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

describe("location coverage", () => {
  const samples = [0, 1000, 11000].map((timestampMs) => ({
    timestampMs, x: timestampMs / 100, y: 0, z: 0, date: "", driver_number: 1,
  }));
  it("interpolates by timestamp and never extrapolates or bridges a telemetry gap", async () => {
    const { interpolateLocation } = await import("modules/replay/utils/telemetry.util");
    expect(interpolateLocation(samples, -1)).toBeNull();
    expect(interpolateLocation(samples, 500)?.x).toBe(5);
    expect(interpolateLocation(samples, 2000)?.x).toBe(10);
    expect(interpolateLocation(samples, 6000)).toBeNull();
    expect(interpolateLocation(samples, 11000)?.x).toBe(110);
    expect(interpolateLocation(samples, 12000)?.x).toBe(110);
    expect(interpolateLocation(samples, 14000)).toBeNull();
    expect(interpolateLocation(samples, Number.NaN)).toBeNull();
    expect(interpolateLocation([samples[0]], 500)?.x).toBe(0);
    expect(interpolateLocation([], 500)).toBeNull();
    for (const step of [1000 / 30, 1000 / 60]) {
      for (let time = 0; time < 500; time += step) interpolateLocation(samples, time);
      expect(interpolateLocation(samples, 500)?.x).toBe(5);
    }
  });

  it("keeps velocity and heading continuous across irregular GPS samples", async () => {
    const { interpolateLocationMotion } = await import("modules/replay/utils/telemetry.util");
    const locations = [
      { timestampMs: 0, x: 0, y: 0, z: 0, date: "", driver_number: 1 },
      { timestampMs: 1000, x: 10, y: 0, z: 0, date: "", driver_number: 1 },
      { timestampMs: 2000, x: 30, y: 10, z: 0, date: "", driver_number: 1 },
      { timestampMs: 3000, x: 60, y: 30, z: 0, date: "", driver_number: 1 },
    ];
    const speed = [0, 1000, 2000, 3000].map((timestampMs) => ({
      timestampMs,
      speed: 3.6,
      gear: 1,
      rpm: 1000,
      throttle: 10,
      brake: 0,
      drs: 0,
    }));
    const before = interpolateLocationMotion(locations, 999, speed);
    const knot = interpolateLocationMotion(locations, 1000, speed);
    const after = interpolateLocationMotion(locations, 1001, speed);
    expect(before?.location).toBeTruthy();
    expect(knot!.location.x).toBeCloseTo(10, 0);
    expect(knot!.location.y).toBeCloseTo(0, 0);
    expect(after?.location).toBeTruthy();
    const speedBefore = Math.hypot(
      knot!.location.x - before!.location.x,
      knot!.location.y - before!.location.y,
    );
    const speedAfter = Math.hypot(
      after!.location.x - knot!.location.x,
      after!.location.y - knot!.location.y,
    );
    expect(Math.abs(speedAfter - speedBefore) / speedBefore).toBeLessThan(0.05);
    expect(knot!.direction.y).toBeGreaterThan(0);
    expect(interpolateLocationMotion(
      locations.slice(0, 3).map((sample) => ({ ...sample, y: 0 })), 1000,
    )?.direction.x).toBeCloseTo(0.015, 6);
  });

  it("weights lap progress by the recorded speed trace", async () => {
    const { speedWeightedProgress } = await import("modules/replay/utils/telemetry.util");
    const speed = [
      { timestampMs: 0, speed: 0 },
      { timestampMs: 500, speed: 0 },
      { timestampMs: 1000, speed: 100 },
      { timestampMs: 1500, speed: 100 },
      { timestampMs: 2000, speed: 100 },
    ].map((sample) => ({
      ...sample,
      gear: 1,
      rpm: 1000,
      throttle: 10,
      brake: 0,
      drs: 0,
    }));
    expect(speedWeightedProgress(speed, 0, 2000, 1000)).toBeCloseTo(0.2, 6);
    expect(
      speedWeightedProgress(
        [speed[0], speed[1], { ...speed[2], timestampMs: 79_000 }, { ...speed[3], timestampMs: 80_000 }],
        0,
        80_000,
        40_000,
      ),
    ).toBeNull();
  });

  it("does not steer across a location gap or backtrack through a hairpin", async () => {
    const { interpolateLocationMotion } = await import("modules/replay/utils/telemetry.util");
    const locations = [
      { timestampMs: 0, x: 0, y: 0, z: 0, date: "", driver_number: 1 },
      { timestampMs: 1000, x: 10, y: 0, z: 0, date: "", driver_number: 1 },
      { timestampMs: 5000, x: 10, y: 10, z: 0, date: "", driver_number: 1 },
    ];
    expect(interpolateLocationMotion(locations, 1000)?.direction.y).toBe(0);

    const hairpin = [
      locations[0],
      locations[1],
      { ...locations[2], timestampMs: 2000, x: 10, y: 1 },
      { ...locations[2], timestampMs: 3000, x: 0, y: 1 },
    ];
    let previousY = 0;
    for (let timestampMs = 1000; timestampMs <= 2000; timestampMs += 20) {
      const location = interpolateLocationMotion(hairpin, timestampMs)!.location;
      expect(location.y).toBeGreaterThanOrEqual(previousY - 1e-9);
      previousY = location.y;
    }
  });
});
