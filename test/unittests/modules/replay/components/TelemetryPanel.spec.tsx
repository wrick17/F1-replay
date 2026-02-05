import { describe, expect, it } from "bun:test";
import { TelemetryPanel } from "modules/replay/components/TelemetryPanel";

describe("TelemetryPanel", () => {
  it("exports a component", () => {
    expect(typeof TelemetryPanel).toBe("function");
  });
});
