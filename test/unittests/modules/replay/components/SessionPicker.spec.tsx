import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionPicker } from "modules/replay/components/SessionPicker";

describe("SessionPicker", () => {
  it("exports a component", () => {
    expect(typeof SessionPicker).toBe("function");
  });

  it("renders only the ended replayable sessions for the selected round", () => {
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
        sessions: [
          {
            session_key: 11230,
            meeting_key: 1279,
            session_name: "Qualifying",
            session_type: "Qualifying",
            date_start: "2026-03-07T05:00:00Z",
            date_end: "2026-03-07T06:00:00Z",
            year: 2026,
          },
        ],
        yearOptions: [2026, 2025],
        isLoading: false,
        onYearChange: () => undefined,
        onRoundChange: () => undefined,
        onSessionTypeChange: () => undefined,
      }),
    );

    expect(markup).toContain(">Qualifying<");
    expect(markup).not.toContain(">Sprint<");
    expect(markup).not.toContain(">Race<");
  });

  it("renders Sprint only when the selected round includes it", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionPicker, {
        year: 2026,
        round: 2,
        sessionType: "Sprint",
        meetings: [
          {
            meeting_key: 1280,
            meeting_name: "Chinese Grand Prix",
            meeting_official_name: "FORMULA 1 CHINESE GRAND PRIX 2026",
            year: 2026,
            country_name: "China",
            circuit_short_name: "Shanghai",
            date_start: "2026-03-20T01:30:00Z",
            date_end: "2026-03-22T06:00:00Z",
          },
        ],
        sessions: [
          {
            session_key: 11240,
            meeting_key: 1280,
            session_name: "Qualifying",
            session_type: "Qualifying",
            date_start: "2026-03-20T05:00:00Z",
            date_end: "2026-03-20T06:00:00Z",
            year: 2026,
          },
          {
            session_key: 11241,
            meeting_key: 1280,
            session_name: "Sprint",
            session_type: "Sprint",
            date_start: "2026-03-21T05:00:00Z",
            date_end: "2026-03-21T06:00:00Z",
            year: 2026,
          },
          {
            session_key: 11242,
            meeting_key: 1280,
            session_name: "Race",
            session_type: "Race",
            date_start: "2026-03-22T05:00:00Z",
            date_end: "2026-03-22T06:00:00Z",
            year: 2026,
          },
        ],
        yearOptions: [2026, 2025],
        isLoading: false,
        onYearChange: () => undefined,
        onRoundChange: () => undefined,
        onSessionTypeChange: () => undefined,
      }),
    );

    expect(markup).toContain(">Qualifying<");
    expect(markup).toContain(">Sprint<");
    expect(markup).toContain(">Race<");
  });

  it("keeps the year picker interactive while a new replay is loading", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionPicker, {
        year: 2025,
        round: 1,
        sessionType: "Race",
        meetings: [
          {
            meeting_key: 1250,
            meeting_name: "Australian Grand Prix",
            meeting_official_name: "FORMULA 1 LOUIS VUITTON AUSTRALIAN GRAND PRIX 2025",
            year: 2025,
            country_name: "Australia",
            circuit_short_name: "Melbourne",
            date_start: "2025-03-14T01:30:00Z",
            date_end: "2025-03-16T06:00:00Z",
          },
        ],
        sessions: [],
        yearOptions: [2026, 2025, 2024, 2023],
        isLoading: true,
        onYearChange: () => undefined,
        onRoundChange: () => undefined,
        onSessionTypeChange: () => undefined,
      }),
    );

    expect(markup).toContain('id="replay-year"');
    expect(markup).toContain('name="replay-year"');
    expect(markup).toContain('for="replay-year"');
    expect(markup).not.toContain('id="replay-year" disabled=""');
  });
});
