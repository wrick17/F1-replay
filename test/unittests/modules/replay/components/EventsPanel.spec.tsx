import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventsPanel } from "modules/replay/components/EventsPanel";

describe("EventsPanel", () => {
  it("exports a component", () => {
    const exportType = typeof EventsPanel;
    expect(exportType === "function" || exportType === "object").toBe(true);
  });

  it("keeps event selection and radio playback as separate buttons", () => {
    const markup = renderToStaticMarkup(
      createElement(EventsPanel, {
        events: [
          {
            timestampMs: 1_000,
            type: "radio",
            color: "#00aaff",
            label: "Team radio",
            detail: "Box this lap",
            data: {
              timestampMs: 1_000,
              driver_number: 1,
              recording_url: "https://example.test/radio.mp3",
              date: "2026-01-01T00:00:00Z",
              session_key: 1,
              meeting_key: 1,
            },
          },
        ],
        startTimeMs: 0,
        currentTimeMs: 0,
        isPlaying: false,
        radioEnabled: true,
        isRadioPlaying: false,
        currentRadio: null,
        onPlayRadio: () => undefined,
        onStopRadio: () => undefined,
        hasEvents: true,
        legendCollapsed: false,
        shortcutsCollapsed: false,
        onToggleLegendCollapsed: () => undefined,
        onToggleShortcutsCollapsed: () => undefined,
        onSelectEvent: () => undefined,
      }),
    );
    const eventButtonStart = markup.indexOf('aria-label="radio: Box this lap"');
    const eventButtonEnd = markup.indexOf("</button>", eventButtonStart);

    expect(eventButtonStart).toBeGreaterThanOrEqual(0);
    expect(markup.slice(eventButtonStart, eventButtonEnd)).not.toContain("<button");
    expect(markup).toContain('aria-label="Play team radio"');
  });
});
