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
Desktop layout includes an Events panel on the left with click-to-seek, active-event auto-scroll, and inline Legend/Shortcuts sections below the list; on mobile, Leaderboard and Events panels are collapsible and shown after the track view.

## Manual smoke test

1. Pick the latest year and round with a Race session.
2. Wait for telemetry to load.
3. Press Play, verify cars animate, leaderboard updates, and telemetry panel shows speed/gear.

## Test commands

- `bun run test` runs fast unit tests (default CI/local loop).
- `bun run test:visual` runs the Playwright-based visual layout suite.

## Data source

Data is fetched directly from the OpenF1 API: https://openf1.org/
