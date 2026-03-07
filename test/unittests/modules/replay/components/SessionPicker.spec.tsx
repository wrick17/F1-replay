import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionPicker } from "modules/replay/components/SessionPicker";

describe("SessionPicker", () => {
  it("exports a component", () => {
    expect(typeof SessionPicker).toBe("function");
  });

  it("renders Race and Qualifying without Sprint", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionPicker, {
        year: 2026,
        round: 1,
        sessionType: "Qualifying",
        meetings: [
          {
            meeting_key: 1279,
            meeting_name: "Australian Grand Prix",
            meeting_official_name: "FORMULA 1 LOUIS VUITTON AUSTRALIAN GRAND PRIX 2026",
            year: 2026,
            country_name: "Australia",
            circuit_short_name: "Melbourne",
            date_start: "2026-03-06T01:30:00Z",
            date_end: "2026-03-08T06:00:00Z",
          },
        ],
        sessions: [],
        yearOptions: [2026, 2025],
        isLoading: false,
        onYearChange: () => undefined,
        onRoundChange: () => undefined,
        onSessionTypeChange: () => undefined,
      }),
    );

    expect(markup).toContain(">Race<");
    expect(markup).toContain(">Qualifying<");
    expect(markup).not.toContain(">Sprint<");
  });
});
