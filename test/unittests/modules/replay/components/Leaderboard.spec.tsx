import { describe, expect, it } from "bun:test";
import { Leaderboard } from "modules/replay/components/Leaderboard";

describe("Leaderboard", () => {
  it("exports a component", () => {
    expect(typeof Leaderboard).toBe("function");
  });
});
