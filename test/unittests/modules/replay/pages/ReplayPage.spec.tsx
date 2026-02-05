import { describe, expect, it } from "bun:test";
import { ReplayPage } from "modules/replay/pages/ReplayPage";

describe("ReplayPage", () => {
  it("exports a component", () => {
    expect(typeof ReplayPage).toBe("function");
  });
});
