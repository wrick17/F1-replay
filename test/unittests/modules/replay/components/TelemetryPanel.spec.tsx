import { describe, expect, it } from "bun:test";
import {
  TelemetryPanel,
  hasCarTelemetryPayload,
} from "modules/replay/components/TelemetryPanel";

describe("TelemetryPanel", () => {
  it("exports a component", () => {
    expect(typeof TelemetryPanel).toBe("function");
  });

  it("treats empty telemetry payloads as unavailable", () => {
    expect(hasCarTelemetryPayload(null)).toBe(false);
    expect(
      hasCarTelemetryPayload({
        sessionKey: 11230,
        sampleIntervalMs: 500,
        createdAt: "2026-03-07T10:00:00Z",
        byDriver: {
          1: [],
          81: [],
        },
      }),
    ).toBe(false);
  });

  it("treats payloads with at least one driver sample as available", () => {
    expect(
      hasCarTelemetryPayload({
        sessionKey: 11230,
        sampleIntervalMs: 500,
        createdAt: "2026-03-07T10:00:00Z",
        byDriver: {
          1: [
            {
              timestampMs: 1_741_341_000_000,
              speed: 302,
              gear: 8,
              rpm: 12_400,
              throttle: 100,
              brake: 0,
              drs: 1,
            },
          ],
        },
      }),
    ).toBe(true);
  });
});
