import { describe, expect, it } from "bun:test";
import { HomePage } from "modules/home/pages/HomePage";

describe("HomePage", () => {
  it("exports a component", () => {
    expect(typeof HomePage).toBe("function");
  });
});
