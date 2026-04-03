import { describe, expect, it } from "bun:test";
import { EventDetailsPage } from "modules/home/pages/EventDetailsPage";

describe("EventDetailsPage", () => {
  it("exports a component", () => {
    expect(typeof EventDetailsPage).toBe("function");
  });
});
