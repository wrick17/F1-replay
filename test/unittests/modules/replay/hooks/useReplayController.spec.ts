import { describe, expect, it } from "bun:test";
import {
  isReplayTimeLoaded,
  useReplayController,
} from "modules/replay/hooks/useReplayController";

describe("useReplayController", () => {
  it("exports a hook", () => {
    expect(typeof useReplayController).toBe("function");
  });

  it("uses the active chunk range independently from the final session end", () => {
    expect(isReplayTimeLoaded(150, 100, 200)).toBe(true);
    expect(isReplayTimeLoaded(900, 100, 200)).toBe(false);
    expect(isReplayTimeLoaded(100, 0, 0)).toBe(false);
  });
});
