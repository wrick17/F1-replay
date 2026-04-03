# F1 Replay (Frontend)

Frontend-only replay viewer for OpenF1 telemetry data, built with Rsbuild, React, Three.js, and Tailwind v4.

## Local development

```sh
bun install
bun run dev
bun run test
```

Open `http://localhost:3000` and choose a year, round, and session type.
The app is a single-page mount with path-based views:

- `/` is the replay-first home dashboard (season schedule, replay cards, standings, news).
- `/:year/:round/:session` is the race details page (for example `/2026/3/race`).
- `/:year/:round/:session/replay` is the telemetry replay experience (for example `/2026/3/race/replay`).
- `/replay` is a bootstrap/legacy entrypoint: it resolves the latest replay or redirects legacy query links.
- `/ops/cache` is a private cache-operations dashboard (login required).

Navigation behavior:

- The F1 Replay logo in `/replay` links back to `/`.
- The same logo is shown in the `/` header for consistent app navigation.
- The "Next Session" countdown on `/` updates live every second without requiring a page refresh.
- "Replay Races" shows replayable sessions (Race/Sprint/Qualifying) across all available replay years, grouped by year and sorted newest-first.
- Home replay CTAs open `Details` first, and details pages provide a `Watch Replay` action.
- Event details data tables render driver headshots and team logos (with inline SVG fallbacks when source media is unavailable).
- Standings are media-enriched: driver standings include OpenF1 headshots + team logos, and constructor standings include team logos.

Direct visits to `/replay` without params auto-resolve to the latest replayable session (prefers `Race`, then `Sprint`, then `Qualifying`) and redirect to the clean replay path.
Legacy `/replay?year=...&round=...&session=...` URLs are still supported and redirect to the clean replay path.
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

## Remote cache warmer (Cloudflare cron)

The project includes a dedicated scheduled worker at `workers/openf1-cache-warmer` that warms both replay and car telemetry caches remotely.

- Hourly run: `0 * * * *`
- Daily deep scan: `15 3 * * *`
- Supported session types: `Qualifying`, `Sprint`, `Race`
- Default retry window: up to 12 hours after `session.date_end`
- Default retry cadence: hourly
- OpenF1 no-data fallback: retries every 24 hours (marked as `OPENF1_NO_DATA`) with an extended retry window to avoid aggressive re-calls

State is persisted in D1 table `warm_session_attempts`, and the worker exposes admin endpoints:

- `POST /admin/run` (optional `?deep=1`) to force an orchestration run
- `GET /admin/status` to inspect retry state and recent session status

Both endpoints require `Authorization: Bearer <ADMIN_TOKEN>`.

### Private Ops dashboard

`/ops/cache` renders a private operations dashboard in the app and talks to `openf1-cache-warmer` using cookie-authenticated endpoints:

- `POST /auth/shoo/login`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /dashboard/sessions`
- `POST /dashboard/warm-all`
- `POST /dashboard/probe`
- `POST /dashboard/sessions/:sessionKey/warm`

Dashboard behavior:

- Shows tracked D1 sessions (`warm_session_attempts`) and sorts missing cache rows to the top
- Sessions with missing cache are sorted to the top
- Cache state uses `missing` (not `expired`) for not-yet-cached entries
- Dashboard reads are D1-only by default (no full-table replay/telemetry probe sweep on every refresh)
- Optional bounded probes use `POST /dashboard/probe` (max 20 keys per request)
- Includes a `Warm All Missing` button that starts a backend batch job (`/dashboard/warm-all`)
- Batch progress (processed/total, failed, succeeded, in-flight) is returned by `GET /dashboard/sessions` and persists across reloads
- Batch execution is resumable from persisted cursor if an in-flight step is interrupted
- Per-session action buttons switch to `Warming...` while their specific warm request is running
- Warm progress is persisted in D1 (`warm_in_progress`, `warm_started_at`) so row loaders survive dashboard reloads and reflect remote batch activity
- Status column only shows `Error` when a cache side is still missing; stale legacy errors are suppressed when cache is already warm

Required worker secrets:

- `OPS_ALLOWED_EMAILS` (comma-separated allowlist, for example `wrick17@gmail.com`)
- `SESSION_SECRET`

Shoo auth settings:

- `SHOO_BASE_URL` (defaults to `https://shoo.dev`)
- The frontend requests Shoo PII (`requestPii: true`) so email is present for allowlist checks
- Worker verifies Shoo `id_token` signature/issuer/audience and only issues session cookies for allowlisted emails

Allowlist maintenance:

- Update with `bunx wrangler secret put OPS_ALLOWED_EMAILS`
- Re-enter the full comma-separated list each time (secret put replaces the value)

Frontend env:

- `RSBUILD_CACHE_WARMER_URL` (defaults to `https://openf1-cache-warmer.wrick17worker.workers.dev`)
- `RSBUILD_ENABLE_REMOTE_CACHE_OPS` (default: `true`)
- `RSBUILD_ENABLE_REMOTE_CACHE_PROBES` (default: `true`)

Local script guard:

- `bun run warm:caches` refuses to hit deployed `workers.dev` URLs unless `CF_REMOTE=1` is set

## Data source

Data is fetched from free public APIs:

- `OpenF1` for replay telemetry and replay availability enrichment: https://openf1.org/
- `Jolpica` (Ergast mirror) for season schedule + standings used by the homepage dashboard: https://api.jolpi.ca/ergast/f1
- Formula1 RSS (via a CORS-safe proxy endpoint) for homepage news cards
