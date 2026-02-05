import { describe, expect, it } from "bun:test";
import type { OpenF1Meeting } from "modules/replay/types/openf1.types";

describe("openf1.types", () => {
  it("describes meeting shape", () => {
    const meeting: OpenF1Meeting = {
      meeting_key: 1,
      meeting_name: "Test GP",
      meeting_official_name: "Test GP Official",
      year: 2024,
      country_name: "Testland",
      circuit_short_name: "Test Circuit",
      date_start: "2024-01-01T00:00:00Z",
      date_end: "2024-01-02T00:00:00Z",
    };
    expect(meeting.meeting_key).toBe(1);
  });
});
