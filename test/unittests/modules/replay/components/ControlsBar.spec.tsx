import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlsBar } from "modules/replay/components/ControlsBar";

describe("ControlsBar", () => {
  it("exports a component", () => {
    expect(typeof ControlsBar).toBe("function");
  });

  it("hides the team radio toggle when no radio clips are available", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlsBar, {
        isPlaying: false,
        isBuffering: false,
        speed: 1,
        currentTimeMs: 1_000,
        startTimeMs: 0,
        endTimeMs: 10_000,
        canPlay: true,
        timelineEvents: [],
        hasTeamRadio: false,
        radioEnabled: false,
        drivers: [],
        isRadioPlaying: false,
        skipIntervalLabel: "10s",
        expanded: false,
        onTogglePlay: () => undefined,
        onSkipBack: () => undefined,
        onSkipForward: () => undefined,
        onCycleSpeed: () => undefined,
        onCycleSkipInterval: () => undefined,
        onToggleExpanded: () => undefined,
        onSeek: () => undefined,
        onRadioToggle: () => undefined,
        onPlayRadio: () => undefined,
        onStopRadio: () => undefined,
        onPauseRadio: () => undefined,
        onResumeRadio: () => undefined,
      }),
    );

    expect(markup).not.toContain("Enable team radio");
    expect(markup).not.toContain("Disable team radio");
  });

  it("shows the team radio toggle when radio clips are available", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlsBar, {
        isPlaying: false,
        isBuffering: false,
        speed: 1,
        currentTimeMs: 1_000,
        startTimeMs: 0,
        endTimeMs: 10_000,
        canPlay: true,
        timelineEvents: [],
        hasTeamRadio: true,
        radioEnabled: false,
        drivers: [],
        isRadioPlaying: false,
        skipIntervalLabel: "10s",
        expanded: false,
        onTogglePlay: () => undefined,
        onSkipBack: () => undefined,
        onSkipForward: () => undefined,
        onCycleSpeed: () => undefined,
        onCycleSkipInterval: () => undefined,
        onToggleExpanded: () => undefined,
        onSeek: () => undefined,
        onRadioToggle: () => undefined,
        onPlayRadio: () => undefined,
        onStopRadio: () => undefined,
        onPauseRadio: () => undefined,
        onResumeRadio: () => undefined,
      }),
    );

    expect(markup).toContain("Enable team radio");
  });

  it("names the play control", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlsBar, {
        isPlaying: true,
        isBuffering: false,
        speed: 1,
        currentTimeMs: 1_000,
        startTimeMs: 0,
        endTimeMs: 10_000,
        canPlay: true,
        timelineEvents: [],
        hasTeamRadio: false,
        radioEnabled: false,
        drivers: [],
        isRadioPlaying: false,
        skipIntervalLabel: "10s",
        expanded: false,
        onTogglePlay: () => undefined,
        onSkipBack: () => undefined,
        onSkipForward: () => undefined,
        onCycleSpeed: () => undefined,
        onCycleSkipInterval: () => undefined,
        onToggleExpanded: () => undefined,
        onSeek: () => undefined,
        onRadioToggle: () => undefined,
        onPlayRadio: () => undefined,
        onStopRadio: () => undefined,
        onPauseRadio: () => undefined,
        onResumeRadio: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="Pause replay"');
  });
});
