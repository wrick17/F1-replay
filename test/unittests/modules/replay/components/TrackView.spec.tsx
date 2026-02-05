import { describe, expect, it } from "bun:test";
import { TrackView } from "modules/replay/components/TrackView";

describe("TrackView", () => {
  it("exports a component", () => {
    expect(typeof TrackView).toBe("function");
  });
});
