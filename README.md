# F1 Replay (Frontend)

Frontend-only replay viewer for OpenF1 telemetry data, built with Rsbuild, React, Three.js, and Tailwind v4.

## Local development

```sh
bun install
bun run dev
bun run test
```

Open `http://localhost:3000` and choose a year, round, and session type.
The app is a single-page mount at `/` and uses URL query params (`year`, `round`, `session`) for shareable state.
The replay picker only shows ended replayable sessions that actually exist for the selected round: `Qualifying`, `Sprint`, and `Race` are supported, while practice sessions stay hidden. Current-season years appear once at least one supported replay session has finished, and year discovery only probes OpenF1 seasons from `2023` onward. The year picker uses a native select that stays interactive during replay loads so season switches remain reliable while replay data is refreshing.
The leaderboard telemetry toggle appears as soon as the first usable car telemetry chunk is available for the current session, and the team radio toggle only appears when that session has radio clips.
The selected replay session is prioritized before background year discovery so race pages are less likely to fail on OpenF1 rate limits.
Transient OpenF1 `429` responses are retried silently in the background until they succeed or the user leaves the page, so partial replay data can stay usable while the remaining chunks backfill.
Desktop layout includes an Events panel on the left with click-to-seek, active-event auto-scroll, and inline Legend/Shortcuts sections below the list; on mobile, Leaderboard and Events panels are collapsible and shown after the track view.

## Manual smoke test

1. Pick the latest replayable year and round, then verify the session picker only shows replayable sessions that exist for that round.
2. Wait for telemetry to load, then verify the telemetry toggle appears only if the session has car telemetry and the team radio toggle appears only if the session has radio clips.
3. Press Play, verify cars animate, leaderboard updates, and telemetry pills show speed/gear once enabled.

## Test commands

- `bun run test` runs fast unit tests (default CI/local loop).
- `bun run test:visual` runs the Playwright-based visual layout suite.

## Data source

Data is fetched directly from the OpenF1 API: https://openf1.org/
