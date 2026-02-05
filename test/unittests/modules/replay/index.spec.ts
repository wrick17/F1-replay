import { describe, expect, it } from "bun:test";
import { ReplayPage } from "modules/replay";

describe("replay index", () => {
  it("exports ReplayPage", () => {
    expect(typeof ReplayPage).toBe("function");
  });
});
