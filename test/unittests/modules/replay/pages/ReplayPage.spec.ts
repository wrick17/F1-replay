import { describe, expect, it } from "bun:test";
import { isReplayHeaderLoading } from "modules/replay/pages/ReplayPage";

describe("ReplayPage header loading", () => {
  it("shows loading when replay payload is still blocking", () => {
    expect(isReplayHeaderLoading(true, false)).toBe(true);
  });

  it("shows loading when car telemetry is loading after replay is ready", () => {
    expect(isReplayHeaderLoading(false, true)).toBe(true);
  });

  it("hides loading when replay and car telemetry are both settled", () => {
    expect(isReplayHeaderLoading(false, false)).toBe(false);
  });
});
