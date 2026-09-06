# F1 Replay

F1 Replay is a React and Rsbuild app for browsing completed Formula 1 sessions and replaying archived timing, position, event, and optional car telemetry data.

Production replay data is a static schema v2 archive at `https://data.f1.wrick17.com/catalog.json`. The browser does not build or upload archives.

## Routes

- `/` lists archived replays and season context.
- `/:year/:round/:session` shows session details.
- `/:year/:round/:session/replay` opens the replay.
- `/replay` keeps old links working and resolves the latest archived replay.
- `/ops/cache` shows catalog health and inventory, with a link to the authenticated GitHub publishing workflow.

Supported replay choices are `Qualifying`, `Sprint`, and `Race`. The publisher uses the exact OpenF1 `session_name`: a Sprint also has the generic `session_type` of Race. Sprint Qualifying is outside these three choices. Empty cancelled sessions and invalid legacy payloads are quarantined during import.

## Development

```sh
bun install
bun run dev
```

The development server listens on `http://localhost:3001`.

Run the checks before a release:

```sh
bun run typecheck
bun run lint
bun run test
bun run build
```

`bun run test:visual` runs the optional Playwright visual checks. `bun run preview` serves the built `dist` directory locally.

Set `RSBUILD_ARCHIVE_URL` to use another archive root. Production defaults to `https://data.f1.wrick17.com`.

## Archive format

The mutable `catalog.json` contains its schema version, publisher-owned `updatedAt`, and the available sessions. Every session points to an immutable manifest in `objects/<sha256>.json`.

The manifest points to immutable core data, position chunks, and optional car telemetry chunks. Object URLs contain the SHA-256 of the uncompressed JSON. R2 stores the bodies with gzip content encoding and long-lived immutable cache headers. The publisher reads each upload back and verifies it before publishing the manifest and catalog.

The first telemetry window is 60 seconds. Later windows are four minutes. Location chunks carry the nearest sample on either side for each driver so interpolation works at chunk boundaries. Car telemetry is optional; the catalog marks it `unavailable` when a valid car archive could not be built.

The catalog `updatedAt` records when the publisher formed a catalog for publication. It is not a timestamp from OpenF1 and does not claim that every optional dataset changed.

## Publishing

Use a dry run for local inspection:

```sh
bun run archive:publish -- --dry-run --out /tmp/f1-archive
```

The default run discovers ended sessions in the current UTC year. Pass `--years 2025,2026` to request explicit years.

Production publishing uses:

```sh
bun run archive:publish
```

It requires these environment variables:

- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_ENDPOINT`
- `S3_REGION`, optional and defaults to `auto`

The bucket name is fixed as `f1-archive`. Keep values in GitHub Actions secrets or local environment storage. Do not commit them.

The workflow at `.github/workflows/archive.yml` checks the Jolpica calendar at 7 and 37 minutes past each hour. Qualifying and Sprint become eligible 90 minutes after their scheduled start; Race becomes eligible after 150 minutes. The workflow retries a missing exact `year/round/type` identity for 48 hours. It ignores Sprint Qualifying and Sprint Shootout, and the publisher still requires OpenF1 to report an actual `date_end` before it fetches a session.

The half-hour gate fails closed when the calendar or a required time is missing or malformed. A missing or malformed checked-in catalog snapshot triggers a publishing attempt for an eligible session, but does not count as a health result. These fast race-window runs attempt at most two current-year sessions.

A daily 03:17 UTC run bypasses the gate and attempts up to ten sessions across every year from 2023 through the current UTC year. Authenticated manual dispatch accepts the same 1–10 attempt limit and an optional comma-separated year list; a blank year input selects every available year from 2023 onward. Repeated bounded runs fill remaining history. The workflow commits `public/archive/catalog.json` only when the snapshot changes. GitHub schedules are best effort and may run late; these times are not an availability guarantee.

The publisher uploads content-addressed core and chunk objects first, then the manifest, then `catalog.json`. A catalog cannot point to an object that has not passed upload readback. Bounded retries cover transient network, HTTP 429, and server errors, and OpenF1 calls are paced to at most 30 per minute.

On 2026-09-06, during a live F1 session, the unauthenticated OpenF1 request `GET /v1/sessions?year=2025` returned HTTP 401 with a temporary restriction on global and past-session access. That observation does not establish the same behavior for every year or endpoint. If OpenF1 returns 401 before a run adds anything, the publisher preserves the exact last good catalog and snapshot. Verified legacy backups remain the path for historical gaps.

## Migration and rollback

Legacy replay and car telemetry data must be inventoried and backed up before any in-place gzip rewrite:

```sh
bun scripts/archive/migrate-legacy.ts inventory --root /tmp/f1-archive-backup
bun scripts/archive/migrate-legacy.ts backup --root /tmp/f1-archive-backup
```

The backup records raw and gzip hashes and verifies gzip round trips. The guarded `apply` command refuses to run until the backup is complete, the remote inventory still matches, and the legacy Workers return read-only responses. It rewrites known objects with gzip metadata and verifies decoded remote hashes. It does not delete source data.

Import legacy backups into a dry-run archive before production:

```sh
bun run archive:publish -- --dry-run --out /tmp/f1-archive-import \
  --import-dir /tmp/f1-archive-backup --import-only
```

The import reads raw backup files first, accepts verified gzip fallbacks, skips existing `year/round/type` identities, and never modifies the backup directory. Unsupported session names, empty cancelled payloads, and invalid objects are skipped into an explicit quarantine report.

Keep the legacy replay and car telemetry Workers read-only during acceptance. A Pages rollback can restore the previous frontend, and that build can still read entries already present behind the legacy Workers. Its old upload attempts receive HTTP 405, so it cannot backfill a legacy cache miss. Archive rollback republishes the last good catalog snapshot; immutable content-addressed objects remain available. Do not delete the legacy D1 databases, R2 objects, or backups until both paths have passed production checks and the retention decision is explicit.

## Cost model

Normal replay reads go directly to static R2 data through the custom domain. They do not execute the old warmer Worker or issue its repeated D1 probes. The publisher uploads only newly discovered immutable objects plus the small mutable catalog.

This design reduces Worker and D1 activity, but it does not promise zero cost or permanent free-tier operation. R2 storage, reads, writes, GitHub Actions time, and any retained legacy services still count against their current provider limits.

## Data sources

- [OpenF1](https://openf1.org/) supplies replay and car telemetry data.
- [Jolpica](https://api.jolpi.ca/ergast/f1/) supplies official rounds, schedules, and standings.
- Validated [MultiViewer circuit data](https://api.multiviewer.app/) supplies canonical geometry when the meeting provides the exact expected circuit URL. The publisher falls back to geometry derived from replay locations.
