import { describe, expect, it } from "bun:test";
import { SessionPicker } from "modules/replay/components/SessionPicker";

describe("SessionPicker", () => {
  it("exports a component", () => {
    expect(typeof SessionPicker).toBe("function");
  });
});
