# F1 Replay architecture and operations

## System overview

F1 Replay has four production parts:

1. Cloudflare Pages serves the Rsbuild single-page app from `dist`.
2. The public R2 custom domain serves `https://data.f1.wrick17.com/catalog.json` and immutable archive objects.
3. `.github/workflows/archive.yml` runs the trusted publisher on schedule or through authenticated manual dispatch.
4. The old replay and car telemetry Workers remain read-only during migration and rollback acceptance.

The legacy cache warmer has no active cron triggers. Scheduled publishing runs in GitHub Actions.

The browser reads published data. It has no archive upload path, publishing token, D1 orchestration loop, or cache-warming controls.

### Application routes

| Route | Purpose |
| --- | --- |
| `/` | Archived replay library and season context |
| `/:year/:round/:session` | Session details |
| `/:year/:round/:session/replay` | Replay timeline and telemetry |
| `/replay` | Latest-replay bootstrap and legacy-link redirect |
| `/ops/cache` | Read-only catalog health and inventory |

The supported archive identities are `year/round/type`, where type comes from the exact OpenF1 `session_name` and is `Qualifying`, `Sprint`, or `Race`. OpenF1's generic `session_type` reports Sprint as Race, so it is not used for this identity. Sprint Qualifying and Sprint Shootout are excluded.

## Runtime data flow

The app resolves the archive root through `RSBUILD_ARCHIVE_URL`. The production build defaults it to `https://data.f1.wrick17.com`.

1. Home, details, and replay routes load and validate `catalog.json`.
2. The chosen catalog entry identifies one immutable manifest.
3. The loader validates the manifest hash, size, schema, session identity, and chunk bounds.
4. Core session data loads once.
5. Location chunks load for the active replay window. Adjacent guard samples preserve interpolation across chunk boundaries.
6. Car telemetry chunks load only when the manifest has a car section and the user opens telemetry.

The catalog loader keeps a recent last-known catalog in browser storage for ordinary replay resilience. The ops route bypasses that fallback when reporting archive health, so it does not label stale local data as current.

## Schema v2 archive

`catalog.json` is the only mutable archive object. Its main fields are:

- `schemaVersion: 2`
- `updatedAt`, set by the publisher when it forms a catalog for publication
- `sessions`, containing meeting/session metadata, replay and car availability, and the manifest descriptor

`updatedAt` belongs to the archive publisher. It is not copied from OpenF1 and does not mean every optional object changed at that time.

Each descriptor has `url`, `sha256`, and uncompressed JSON `bytes`. Immutable URLs use `objects/<sha256>.json`, so changing content produces a new path.

A session manifest contains:

- the core replay object
- ordered location chunk descriptors
- optional car telemetry metadata and chunk descriptors
- the session, meeting, round, and time bounds needed to reject mismatched objects

Core data includes session metadata, drivers, timing, race control, weather, pit, overtake, radio, and track geometry data. Driver locations live in compact numeric tuples outside the core object. Car tuples contain timestamp, driver, speed, gear, RPM, throttle, brake, and DRS.

Track geometry can include an optional `pitLane` array of raw XY coordinates. The publisher derives it from a complete measured pit traversal. Older archives use bundled circuit/year pit references only when their circuit anchors align with the selected geometry. Rebuild those references with `bun scripts/archive/build-pit-lanes.ts <full-replay-export-directory>`; this reads local exports and makes no cloud requests. A session without a credible traversal or aligned reference omits the pit lane.

Driver dots stay at their measured coordinates. Crowded captions can be hidden, while each dot remains focusable. After a telemetry gap, a dashed dot retains the last measured location and its details identify it as stale. A driver without a past location sample is not assigned a guessed track position.

The first location and car window is 60 seconds, followed by four-minute windows. Location chunks include the nearest per-driver sample before and after the owned window as guards. This keeps interpolation stable without duplicating whole sessions.

Car telemetry is optional. `status.car` is `ready` when its chunks were published and `unavailable` otherwise. Replay core and location data remain usable without it.

R2 stores JSON bodies with `Content-Encoding: gzip`. Immutable objects use `Cache-Control: public, max-age=31536000, immutable`; `catalog.json` uses a five-minute public cache. The publisher verifies each content hash locally, reads each R2 upload back, decompresses when needed, and compares the exact JSON before it publishes references to that object.

## Publisher

Run the default current-UTC-year discovery locally without writing to R2:

```sh
bun run archive:publish -- --dry-run --out /tmp/f1-archive
```

Select years explicitly when needed:

```sh
bun run archive:publish -- --dry-run --out /tmp/f1-archive --years 2025,2026
```

Production publishing is:

```sh
bun run archive:publish
```

The required secret names are `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_ENDPOINT`. `S3_REGION` is optional and defaults to `auto`. The publisher writes to the fixed `f1-archive` bucket and verifies the public catalog at `https://data.f1.wrick17.com/catalog.json` before it succeeds.

For each ended supported session, the publisher:

1. discovers OpenF1 meetings and sessions and reads the Jolpica calendar
2. matches the meeting to the official Jolpica round, accounting for Las Vegas's local race date
3. builds replay data through the existing replay builders
4. builds optional 500 ms car telemetry buckets
5. accepts canonical track geometry only from the exact expected `https://api.multiviewer.app/api/v1/circuits/<circuitKey>/<year>` URL and validates its identity and points, otherwise derives geometry from locations
6. uploads core and chunks, then the session manifest
7. merges the new stable `year/round/type` entries into the existing catalog and uploads the catalog last

The client paces OpenF1 requests to at most 30 per minute. Transient network failures, HTTP 429, and server errors get bounded retries. An individual session build failure is logged and skipped. An OpenF1 HTTP 401 stops further discovery because retrying an access restriction would waste calls.

On 2026-09-06, during a live F1 session, `GET https://api.openf1.org/v1/sessions?year=2025` returned HTTP 401. The response described a temporary restriction on global API and past-session access until the live session ended. This was one observed year, endpoint, and time condition. It does not prove that all historical endpoints are restricted. If a 401 occurs before additions, the publisher keeps the prior catalog and snapshot byte-for-byte. If verified legacy imports were completed earlier in the run, it may publish those additions.

The GitHub workflow checks the current UTC year's Jolpica calendar at 7 and 37 minutes past every hour. During the first 48 hours of January it also checks the prior year. It considers only the exact `Qualifying`, `Sprint`, and `Race` calendar fields:

- Qualifying and Sprint become eligible 90 minutes after their scheduled start.
- Race becomes eligible 150 minutes after its scheduled start.
- An eligible identity remains in the retry window for 48 hours while it is absent from the checked-in catalog snapshot.

This gate estimates when a session should be over. The publisher separately requires an actual OpenF1 `date_end`, so it does not fetch an ongoing session. A missing or malformed calendar, or a required session without a date and time, produces `publish: false`. A missing or malformed snapshot produces a publishing attempt when a session is eligible; it is not reported as current archive health.

Fast race-window runs attempt at most two current-year sessions. The daily 03:17 UTC run forces a backfill across every year from 2023 through the current UTC year and attempts at most ten sessions. Authenticated `workflow_dispatch` accepts a 1–10 attempt limit or a 100-session bulk run, plus an optional comma-separated year list; leaving the year input blank selects the same 2023-to-current range. Bulk jobs have a six-hour timeout; regular jobs retain two hours. Repeated bounded runs fill remaining history, with the newest missing replay sessions ahead of car-only repairs.

The workflow installs Bun 1.4.0 from the frozen lockfile, commits `public/archive/catalog.json` only when it changes (including verified partial progress after a publishing failure), and uses no Cloudflare compute for scheduling. GitHub scheduled workflows are best effort and may be delayed; the calendar thresholds are not an availability guarantee. GitHub permissions protect manual publishing, and the frontend only links to the workflow.

A separate 02:47 UTC maintenance job prevents GitHub's 60-day public-repository inactivity shutdown. It creates an empty commit only after 30 days without a repository commit. The `[CF-Pages-Skip]` prefix prevents a Pages build. This job has no R2 credentials and does not run the publisher.

## Build, test, and deploy

Install and start the app:

```sh
bun install
bun run dev
```

Run the release checks:

```sh
bun run typecheck
bun run lint
bun run test
bash test/keep-schedules-active.sh
bun run build
```

`bun run test:visual` runs the optional visual suite. `bun run preview` serves the built output locally.

The Pages deployment must publish `dist` from a commit that passed these checks. Use the existing Pages project and Git integration rather than adding a second deployment path. After deployment, verify the home route, one details route, one archived replay, `/ops/cache`, and the catalog URL. Check that the replay loads core and location data and that a session marked `car: ready` can load a telemetry chunk.

The archive workflow is separate from the Pages deploy. A frontend deploy never needs R2 write credentials.

## Legacy migration

Migration begins with a read-only inventory of the two legacy D1 indexes and R2 buckets:

```sh
bun scripts/archive/migrate-legacy.ts inventory --root /tmp/f1-archive-backup
```

Create the backup before any rewrite:

```sh
bun scripts/archive/migrate-legacy.ts backup --root /tmp/f1-archive-backup
```

The backup command:

- refuses an incomplete or unexpected D1-to-R2 inventory
- downloads each source object without changing it
- records raw and gzip byte counts and SHA-256 digests
- verifies every gzip round trip
- resumes only when the remote inventory still matches its manifest

The guarded in-place gzip command is:

```sh
bun scripts/archive/migrate-legacy.ts apply \
  --root /tmp/f1-archive-backup \
  --confirm readonly-workers-deployed-and-backup-verified
```

Run it only after the read-only legacy Worker versions are live and the backup has been reviewed. The command revalidates the complete backup and unchanged inventory, checks that both Workers reject `POST` with HTTP 405, rewrites one known R2 object at a time with gzip metadata, and verifies the decoded remote SHA-256. It records progress after each object and does not delete D1 rows, R2 objects, or local backups.

Convert verified legacy backups into the schema v2 archive with a dry run first:

```sh
bun run archive:publish -- --dry-run --out /tmp/f1-archive-import \
  --import-dir /tmp/f1-archive-backup --import-only
```

The importer prefers `raw/replay` and `raw/car-telemetry`, then accepts their gzip backup forms. It maps rounds through Jolpica, skips identities already in the catalog, and treats missing car telemetry as optional. Unsupported session names, empty cancelled payloads, and invalid objects are recorded in an explicit quarantine report. The importer never edits the backup input.

After reviewing the dry-run output, the same import without `--dry-run --out` writes new schema v2 objects to R2. The publisher still uploads the manifest and catalog last and verifies public readback.

## Rollback and retirement

Keep the legacy Workers, D1 databases, R2 objects, and verified backup read-only until the new Pages build and archive have passed production acceptance.

If the frontend fails, roll Pages back to the previous deployment. That build can still read entries already present through the legacy Worker GET path. Its old upload attempts receive HTTP 405, so it cannot backfill a legacy cache miss. If the archive catalog fails, republish the last good `public/archive/catalog.json` snapshot. Content-addressed objects are immutable and remain addressable, so catalog rollback does not require rewriting them.

Do not delete legacy data as part of migration. Retire the warmer schedule only after a successful trusted publish and valid live schema v2 catalog check. Then remove the old warmer cron triggers, verify scheduled events stop, and separately decide the retention period for the warmer Worker, its D1 state, and old cache storage.

## Cost model

Normal replay traffic reads static gzip content from the R2 custom domain. It does not invoke the old cache warmer or poll D1. Content-addressed objects are uploaded once and reused; routine publisher runs write only new session objects and the small mutable catalog.

The design aims to fit low-volume operation within available free allowances, but no allowance or traffic pattern is guaranteed. Track R2 storage, Class A and Class B operations, GitHub Actions minutes, Pages usage, and any retained Worker or D1 activity against the providers' current limits.

## Source ownership

- OpenF1 owns session, timing, position, event, radio, weather, and car telemetry source data.
- Jolpica owns calendar, round, schedule, and standings source data used here.
- MultiViewer supplies canonical circuit geometry only through the validated URL described above.
- The archive publisher owns schema conversion, object hashes, chunk boundaries, availability flags, and catalog `updatedAt`.
- The Pages app owns presentation and local replay state. It does not own or mutate published telemetry.
