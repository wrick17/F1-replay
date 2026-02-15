import { describe, expect, it } from "bun:test";
import {
  createDownsampleState,
  finalizeCarTelemetryPayload,
  getBarColorClass,
  ingestCarDataChunk,
  isDrsOn,
  isSpeedDanger,
  normalizeBrakePercent,
  normalizeDrsPercent,
  computeSessionStats,
} from "../../../../src/modules/replay/services/carTelemetry.service";

describe("carTelemetry.service", () => {
  it("downsamples to 500ms buckets and keeps last sample in bucket", () => {
    const state = createDownsampleState(123, 500);
    ingestCarDataChunk(state, [
      {
        date: "2024-01-01T00:00:00.100Z",
        driver_number: 1,
        speed: 100,
        n_gear: 3,
        rpm: 9000,
        throttle: 10,
        brake: 0,
        drs: 0,
        session_key: 123,
        meeting_key: 1,
      },
      {
        date: "2024-01-01T00:00:00.400Z",
        driver_number: 1,
        speed: 120,
        n_gear: 4,
        rpm: 9500,
        throttle: 20,
        brake: 0,
        drs: 0,
        session_key: 123,
        meeting_key: 1,
      },
    ]);
    const payload = finalizeCarTelemetryPayload(state);
    expect(payload.byDriver[1]?.length).toBe(1);
    expect(payload.byDriver[1]?.[0]?.speed).toBe(120);
    expect(payload.byDriver[1]?.[0]?.gear).toBe(4);
  });

  it("maps DRS ON for raw values 10/12/14", () => {
    expect(isDrsOn(10)).toBe(true);
    expect(isDrsOn(12)).toBe(true);
    expect(isDrsOn(14)).toBe(true);
    expect(isDrsOn(0)).toBe(false);
    expect(normalizeDrsPercent(12)).toBe(100);
    expect(normalizeDrsPercent(0)).toBe(0);
  });

  it("maps brake > 0 to 100% else 0%", () => {
    expect(normalizeBrakePercent(0)).toBe(0);
    expect(normalizeBrakePercent(1)).toBe(100);
    expect(normalizeBrakePercent(50)).toBe(100);
  });

  it("computes bar color buckets", () => {
    expect(getBarColorClass(0)).toBe("bg-blue-400");
    expect(getBarColorClass(24)).toBe("bg-blue-400");
    expect(getBarColorClass(25)).toBe("bg-green-400");
    expect(getBarColorClass(50)).toBe("bg-yellow-400");
    expect(getBarColorClass(75)).toBe("bg-red-500");
  });

  it("flags speed danger when speed > 200", () => {
    expect(isSpeedDanger(200)).toBe(false);
    expect(isSpeedDanger(201)).toBe(true);
  });

  it("computes rpmMaxSession capped at 15000 and speedMaxSession clamped to [250, 380]", () => {
    const state = createDownsampleState(123, 500);
    ingestCarDataChunk(state, [
      {
        date: "2024-01-01T00:00:00.100Z",
        driver_number: 1,
        speed: 120,
        n_gear: 3,
        rpm: 18000,
        throttle: 10,
        brake: 0,
        drs: 0,
        session_key: 123,
        meeting_key: 1,
      },
    ]);
    const payload = finalizeCarTelemetryPayload(state);
    const stats = computeSessionStats(payload);
    expect(stats.rpmMaxSession).toBe(15000);
    expect(stats.speedMaxSession).toBe(250);
  });
});

