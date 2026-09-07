import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ReplayGameHUD,
  type ReplayGameHUDProps,
} from "../../src/modules/replay/components/ReplayGameHUD";
import { getReplayEnvironment } from "../../src/modules/replay/utils/replayEnvironment.util";

test("game HUD uses leader lap, recorded local time and past events, retaining controls when hidden", () => {
  const now = Date.parse("2026-07-05T14:30:00Z");
  const leader = {
    driverNumber: 63,
    driverName: "George Russell",
    driverAcronym: "RUS",
    headshotUrl: null,
    teamName: "Mercedes",
    teamLogoUrl: null,
    teamInitials: "MER",
    lapDurationSeconds: null,
    isPitOutLap: false,
    position: 1,
    lap: 1,
    compound: "MEDIUM",
  };
  const props: ReplayGameHUDProps = {
    rows: [leader, { ...leader, driverNumber: 11, position: 20, lap: 2 }],
    driverStates: { 63: { position: null, color: "#27f4d2" } },
    events: [
      { timestampMs: now - 1000, type: "pit", color: "#fff", label: "PAST EVENT", detail: "", data: null },
      { timestampMs: now + 1000, type: "flag", color: "#fff", label: "FUTURE EVENT", detail: "", data: null },
    ],
    currentTimeMs: now,
    startTimeMs: now - 60_000,
    isPlaying: false,
    weather: null,
    environment: getReplayEnvironment(now, "+01:00", null),
    meetingName: "British Grand Prix",
    sessionType: "Race",
    panelsVisible: true,
    onSeek: () => {},
    controls: <div>CONTROLS SLOT</div>,
    telemetryPanel: <div>TELEMETRY SLOT</div>,
    eventsPanel: <div>EVENTS SLOT</div>,
    onShowPanels: () => {},
    followDriver: 63,
    onFollowDriver: () => {},
  };
  const html = renderToStaticMarkup(<ReplayGameHUD {...props} />);
  expect(html).toContain("PAST EVENT");
  expect(html).not.toContain("FUTURE EVENT");
  expect(html).toContain("15:30");
  expect(html).toContain("Following RUS");
  expect(html).toContain("Medium tyres");
  expect(html).toContain("TELEMETRY SLOT");
  expect(html).toContain("EVENTS SLOT");
  expect(html).toContain('aria-label="Driver telemetry inspector"');
  expect(html).toMatch(/game-tower-lap[^>]*>LAP\s*<b>1<\/b>/);
  const overview = renderToStaticMarkup(<ReplayGameHUD {...props} followDriver={null} />);
  expect(overview).toContain("Leader telemetry");
  expect(overview).toContain("<strong>George Russell</strong>");
  expect(overview).not.toContain("Stop following");
  const hidden = renderToStaticMarkup(<ReplayGameHUD {...props} panelsVisible={false} />);
  expect(hidden).not.toContain("Race classification");
  expect(hidden).toContain("CONTROLS SLOT");
  expect(hidden).toContain("Race events</button>");
  expect(hidden).toContain("Telemetry</button>");
  const unknown = renderToStaticMarkup(<ReplayGameHUD {...props} rows={[]} />);
  expect(unknown).toMatch(/game-tower-lap[^>]*>LAP\s*<b>—<\/b>/);
});
