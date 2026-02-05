import { describe, expect, it } from "bun:test";
import { useReplayData } from "modules/replay/hooks/useReplayData";

describe("useReplayData", () => {
  it("exports a hook", () => {
    expect(typeof useReplayData).toBe("function");
  });
});
