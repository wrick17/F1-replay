import { describe, expect, it } from "bun:test";
import { EventsPanel } from "modules/replay/components/EventsPanel";

describe("EventsPanel", () => {
  it("exports a component", () => {
    const exportType = typeof EventsPanel;
    expect(exportType === "function" || exportType === "object").toBe(true);
  });
});
