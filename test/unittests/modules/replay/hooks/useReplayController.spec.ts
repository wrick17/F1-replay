import { describe, expect, it } from "bun:test";
import { useReplayController } from "modules/replay/hooks/useReplayController";

describe("useReplayController", () => {
  it("exports a hook", () => {
    expect(typeof useReplayController).toBe("function");
  });
});
