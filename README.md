# F1 Replay (Frontend)

Frontend-only replay viewer for OpenF1 telemetry data, built with Rsbuild, React, Three.js, and Tailwind v4.

## Local development

```sh
bun install
bun run dev
```

Open `http://localhost:3000` and choose a year, round, and session type.
The app is a single-page mount at `/` and uses URL query params (`year`, `round`, `session`) for shareable state.

## Manual smoke test

1. Pick the latest year and round with a Race session.
2. Wait for telemetry to load.
3. Press Play, verify cars animate, leaderboard updates, and telemetry panel shows speed/gear.

## Data source

Data is fetched directly from the OpenF1 API: https://openf1.org/
