import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineSlider } from "modules/replay/components/TimelineSlider";

describe("TimelineSlider", () => {
  it("renders a keyboard accessible range alongside event markers", () => {
    const markup = renderToStaticMarkup(
      createElement(TimelineSlider, {
        currentTimeMs: 1_000,
        startTimeMs: 0,
        endTimeMs: 10_000,
        events: [
          {
            timestampMs: 2_000,
            type: "flag",
            color: "#ffcc00",
            label: "Yellow flag",
            detail: "Sector 1",
            data: null,
          },
        ],
        drivers: [],
        isPlaying: false,
        radioEnabled: false,
        isRadioPlaying: false,
        expanded: false,
        onSeek: () => undefined,
        onPlayRadio: () => undefined,
        onStopRadio: () => undefined,
        onPauseRadio: () => undefined,
        onResumeRadio: () => undefined,
      }),
    );

    expect(markup).toContain('type="range"');
    expect(markup).toContain('step="1000"');
    expect(markup).toContain('aria-label="Replay timeline"');
    expect(markup).toContain('aria-valuetext="00:01 of 00:10"');
    expect(markup).toContain('aria-label="Yellow flag event"');
  });
});
