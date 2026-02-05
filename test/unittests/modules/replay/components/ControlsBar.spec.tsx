import { describe, expect, it } from "bun:test";
import { ControlsBar } from "modules/replay/components/ControlsBar";

describe("ControlsBar", () => {
  it("exports a component", () => {
    expect(typeof ControlsBar).toBe("function");
  });
});
