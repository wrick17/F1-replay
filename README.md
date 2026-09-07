# F1 Replay

F1 Replay is a React and Rsbuild app for browsing completed Formula 1 sessions and replaying archived timing, position, event, and optional car telemetry data.

Production replay data is a static schema v2 archive at `https://data.f1.wrick17.com/catalog.json`. The browser does not build or upload archives.

GitHub Actions handles scheduled publishing. The legacy Cloudflare warmer's cron triggers are disabled; its read-only data remains available for rollback.

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
bash test/keep-schedules-active.sh
bun run build
```

`bun run test:visual` runs the optional Playwright visual checks. `bun run preview` serves the built `dist` directory locally.

Set `RSBUILD_ARCHIVE_URL` to use another archive root. Production defaults to `https://data.f1.wrick17.com`.

## 3D replay

Replays open in 2D. The button beside the logo switches views without resetting playback; its label shows the current view. In 3D, drag to orbit, right-drag to pan, scroll to zoom, and click a car or timing row to follow a driver. Reset fits the circuit between the HUD panels using the 2D map's orientation. Manual camera changes survive view switches. Telemetry and race events are available in the right-hand HUD.

The world follows the recorded weather and race-local time at the replay cursor, including backward seeks. Red-and-white kerbs follow detected corner sections; straights retain white edge lines. Kerb placement remains procedural. Mapped surroundings use current OpenStreetMap features for every replay year; missing building heights and individual trees are estimated.

Road width, car scale, kerb detection, prop spacing, and terrain clearance use the same renderer for every circuit. Terrain is cut below intersecting road surfaces. Retaining walls support substantial drops; ordinary edges meet the local ground with an earth shoulder.

Circuit elevation profiles are derived from archived location data and matched against the replay's ordered track layout. The terrain and pit lane follow the road height. Relief uses a 1.65× vertical scale for readability; Suzuka also has an open underpass with additional bridge clearance for the miniature cars. Source provenance and coverage are recorded in `src/modules/replay/data/circuitElevations.json`.

Both views share circuit map bundles served from `public/circuits/`. Building footprints, roads, parking, water, and vegetation areas are aligned to the archived circuit with a measured similarity fit. The loader validates coordinates and ordered track anchors before displaying a bundle. Cars keep their recorded positions. Attribution and data licences accompany the bundles.

The 2D map uses SVG vectors; the 3D map uses terrain-conforming vector geometry, with nearby buildings extruded and distant footprints retained. Camera limits keep exploration near the circuit, and fog softens the outer coverage boundary. No map provider requests occur during playback.

Surrounding terrain uses packaged Copernicus DEM GLO-30 samples. This is a surface model, so trees and buildings can affect its heights. Terrain is calibrated to the replay's elevation profile, with road clearance preserved. See `public/circuits/TERRAIN-LICENSE.txt` for source credit and terms.

Run `bun run generate:elevations` to rebuild profiles from the archive. It verifies source object hashes, caches downloads under `/tmp/f1-elevation-profiles`, and records any unsupported layouts as gaps instead of inventing elevations.

Run `bun run generate:surroundings --all` to rebuild the curated circuit bundles, or `bun run generate:surroundings --circuit 46` for Suzuka. This requires Python 3 and the `tiffcrop` command from libtiff. OSM and DEM downloads are cached under `/tmp/f1-circuit-surroundings`; generation depends on the public Overpass service being available. The bundles record alignment evidence and source attribution; mapped surroundings describe today's venue, not its historical layout.

Pit lanes include team-colored garages and stopping bays, placed procedurally on clear sections. Car headings ease through turns without changing recorded positions and snap correctly when seeking.

Cars use the supplied `public/models/rmgt-toon-f1-remix.stl`: one shared 8,832-triangle mesh with team-colored bodywork and black tires, loaded only in 3D.

The renderer uses WebGPU when available and falls back to WebGL2. Plain HTTP LAN addresses use WebGL2; archive integrity checks also work there without the secure-context Web Crypto API. The 3D renderer loads only when requested and stops drawing when idle or in 2D.

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

A daily 03:17 UTC run bypasses the gate and attempts up to ten sessions across every year from 2023 through the current UTC year. Authenticated manual dispatch accepts a 1–10 attempt limit or a 100-session bulk run, plus an optional comma-separated year list; a blank year input selects every available year from 2023 onward. The explicit bulk option has a six-hour job limit; regular jobs retain a two-hour limit. Repeated bounded runs fill remaining history. The workflow commits `public/archive/catalog.json` only when the snapshot changes. GitHub schedules are best effort and may run late; these times are not an availability guarantee.

A separate daily 02:47 UTC check makes one empty `[CF-Pages-Skip]` commit after 30 days without a repository commit. This keeps GitHub's scheduled workflow enabled through the winter without running the publisher, writing to R2, or starting a Pages build.

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
