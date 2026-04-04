# F1 Replay Documentation

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Components](#components)
- [Hooks](#hooks)
- [Services](#services)
- [API Integration](#api-integration)
- [Testing](#testing)
- [Contributing](#contributing)

## Overview

F1 Replay is a replay-first Formula 1 web app with a home dashboard at `/`, a race details route at `/:year/:round/:session`, and a telemetry replay route at `/:year/:round/:session/replay`. Built with React, it combines Jolpica (schedule/standings), OpenF1 (replay telemetry + replay availability), and a non-blocking Formula1 RSS feed for editorial context.

## Features

### 🏎️ Race Replay
- **Time-based Playback**: Scrub through any F1 session with a dynamic timeline
- **Playback Controls**: Play, pause, and adjust playback speed (0.25x to 4x)
- **Live Leaderboard**: Real-time driver standings with positions, gaps, and tire information
- **3D Track View**: Visual representation of driver positions on the track

### 📊 Telemetry & Data
- **Event Markers**: Visual indicators for DRS zones, pit stops, safety cars, and overtakes
- **Events Panel**: Left-side chronological event list with timestamp, click-to-seek, active-event red line, playback auto-scroll, inline radio player controls, plus Legend/Shortcuts sections below the list
- **Leaderboard Telemetry Toggle**: Optional per-driver car telemetry pills (speed/gear/RPM/throttle/brake/DRS) inside the Leaderboard panel, shown only when car telemetry exists for the selected session
- **Weather Data**: Live weather conditions including air/track temperature, humidity, and rainfall
- **Team Radio**: Listen to team radio communications with timestamp markers when OpenF1 provides radio clips for the selected session

### 🎯 User Experience
- **Replay-First Home (`/`)**: Dashboard with latest replay CTA, next session highlight, completed replay cards, upcoming race details, standings, and newsroom feed
- **Cross-Year Replay Library**: Replay sessions are listed across all replayable years and grouped by year in descending order
- **Race Details Route (`/:year/:round/:session`)**: Event details page with metadata, sessions analysis/stints/lap metrics, driver headshots, team logos, and a dedicated `Watch Replay` CTA
- **Standings Media**: Driver standings render driver headshots + team logos; constructor standings render team logos
- **Live Countdown**: Next-session timer on home updates continuously (no manual refresh required)
- **Replay Experience (`/:year/:round/:session/replay`)**: Full telemetry timeline, track map, events, and controls
- **Ops Cache Dashboard (`/ops/cache`)**: Private cache-ops page with session cache status, manual refresh, and per-session warm actions
- **Logo Navigation**: F1 Replay logo is shown on both `/` and replay pages; clicking it on replay returns to home
- **Replay Route Bootstrap**: Opening `/replay` without params auto-selects the latest replayable session (`Race` -> `Sprint` -> `Qualifying`) and redirects to clean replay paths
- **Legacy Replay Redirect**: `/replay?year=...&round=...&session=...` redirects to `/:year/:round/:session/replay`
- **Session Picker**: Select from any year, round, and session type
- **Keyboard Shortcuts**: Quick controls for playback and navigation
- **Responsive Design**: Works across different screen sizes
- **Mobile Weather Badge**: Weather widget uses a compact single-row layout on mobile without horizontal scrolling
- **Mobile Collapsible Panels**: Leaderboard and Events panels can be expanded/collapsed on mobile (default expanded)
- **Collapsed Mobile Headers**: On mobile, collapsed Leaderboard/Events render as header rows only, and expanding restores the full panel body without overlap
- **Desktop Panel Safe Zones**: Left/right side panels are constrained with bottom clearance above the controls bar to prevent overlap or out-of-bounds rendering
- **Responsive Side Panels**: On smaller desktop heights, telemetry/events lists remain usable via internal scrolling without clipping outside the viewport
- **Persistent Preferences**: Remember user settings across sessions

## Tech Stack

### Core Framework
- **React 19.2.4**: UI library with latest features
- **TypeScript 5.9.3**: Type-safe development

### Build Tools
- **Rsbuild 1.7.3**: Fast Rspack-powered build tool
- **Rspack**: High-performance bundler

### URL State
- **Path + Query State**:
  - `/` renders `HomePage`
  - `/:year/:round/:session` renders `EventDetailsPage`
  - `/:year/:round/:session/replay` renders replay and keeps route state in path params
  - `/replay` is reserved for bootstrap/legacy redirects
  - `/ops/cache` renders `OpsCacheDashboardPage`

### Styling
- **Tailwind CSS 4.1.18**: Utility-first CSS framework
- **PostCSS**: CSS processing with Tailwind plugin

### UI & Animation
- **Framer Motion 12.33.0**: Animation library for smooth transitions
- **Lucide React 0.563.0**: Modern icon library

### Development Tools
- **Biome 2.3.14**: Fast linter and formatter
- **Bun**: Fast JavaScript runtime and package manager

## Project Structure

```
f1-replay/
├── src/
│   ├── index.tsx              # Application entry point
│   ├── index.css              # Global styles
│   ├── app/
│   │   └── routing.ts         # Route parsing/building helpers for home, event, replay, ops
│   └── modules/
│       ├── home/              # Home dashboard module
│       │   ├── hooks/
│       │   │   └── useHomeDashboard.ts
│       │   │   └── useReplayEventDetails.ts
│       │   ├── pages/
│       │   │   └── EventDetailsPage.tsx
│       │   │   └── HomePage.tsx
│       │   ├── services/
│       │   │   └── eventDetails.service.ts
│       │   │   └── homeData.service.ts
│       │   └── types/
│       │       └── home.types.ts
│       └── replay/            # Replay module
│           ├── index.ts
│           ├── pages/         # Page components
│           │   └── ReplayLegacyRedirectPage.tsx
│           │   └── ReplayPage.tsx
│           │   └── ReplayRoutePage.tsx
│           ├── components/    # UI components
│           │   ├── ControlsBar.tsx
│           │   ├── EventMarkerPopup.tsx
│           │   ├── EventsPanel.tsx
│           │   ├── Leaderboard.tsx
│           │   ├── MarkerLegend.tsx
│           │   ├── RadioPopup.tsx
│           │   ├── SessionPicker.tsx
│           │   ├── TelemetryPanel.tsx
│           │   ├── TimelineSlider.tsx
│           │   ├── TrackView.tsx
│           │   └── WeatherBadge.tsx
│           ├── hooks/         # Custom React hooks
│           │   ├── useKeyboardShortcuts.ts
│           │   ├── useReplayController.ts
│           │   ├── useReplayData.ts
│           │   ├── useSessionSelector.ts
│           │   ├── useTeamRadio.ts
│           │   ├── useTrackComputation.ts
│           │   └── useUserPreferences.ts
│           ├── services/      # Business logic
│           │   ├── driverState.service.ts
│           │   ├── events.service.ts
│           │   ├── telemetry.service.ts
│           │   ├── trackBuilder.service.ts
│           │   └── weather.service.ts
│           ├── api/           # API client
│           │   ├── cache.ts
│           │   ├── openf1.client.ts
│           │   └── rateLimiter.ts
│           ├── types/         # TypeScript definitions
│           ├── utils/         # Utility functions
│           └── constants/     # Constants and config
├── public/                    # Static assets
├── test/                      # Test files
│   └── unittests/
├── package.json
├── rsbuild.config.ts         # Build configuration
├── tailwind.config.ts        # Tailwind configuration
├── tsconfig.json             # TypeScript configuration
└── biome.json                # Biome linter/formatter config
```

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) runtime installed (or Node.js 18+)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd f1-replay

# Install dependencies
bun install
```

### Development

```bash
# Start development server
bun run dev

# Application will be available at http://localhost:3001
```

### Building for Production

```bash
# Build the application
bun run build

# Preview production build
bun run preview
```

### Code Quality

```bash
# Run linter
bun run lint

# Fix linting issues
bun run lint:fix

# Format code
bun run format

# Run tests
bun run test

# Run visual layout tests
bun run test:visual

# Warm Cloudflare caches
#
# Combined (replay + car telemetry):
bun run warm:caches

# Aliases:
# - bun run warm:cache
# - bun run warm:telemetry-cache
```

Notes:
- Warmers retry failed API requests with exponential backoff (built-in defaults).
- If any API request returns `401`, the warmer stops immediately (to avoid spamming when credentials are invalid).
- The warmer attempts to cache all ended sessions across the dataset (falls back to year-by-year queries if OpenF1's `meetings` endpoint doesn't return multiple years).
- While the warmer is running, a live dashboard is served at `http://localhost:3002` (override via `DASHBOARD_PORT`).

### Remote Cloudflare cache warmer

For production cache prewarming (without relying on a local machine), use `workers/openf1-cache-warmer`.

- Hourly run: `0 * * * *`
- Daily deep scan: `15 3 * * *` (rotates one historical season per day using a persisted cursor)
- Supports `Qualifying`, `Sprint`, and `Race` only
- Retries worker/transient failures hourly for up to 12 hours after session end
- OpenF1 no-data failures (`OPENF1_NO_DATA`) retry every 24 hours with an extended retry window to avoid repeated near-term calls

Admin endpoints (auth required):

- `POST /admin/run` (optionally `?deep=1`) to trigger a manual run
- `GET /admin/status` to inspect recent `warm_session_attempts` state

Dashboard endpoints (cookie auth):

- `POST /auth/shoo/login`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /dashboard/sessions`
- `POST /dashboard/warm-all`
- `POST /dashboard/probe`
- `POST /dashboard/sessions/:sessionKey/warm`

Dashboard data behavior:

- Returns tracked D1 rows from `warm_session_attempts` (no full historical rediscovery on each dashboard read)
- `GET /dashboard/sessions` also returns persisted warm-all batch state from `warm_worker_state`
- Rows with missing cache state are prioritized first in the UI sort order
- Uses `missing` cache status (legacy `expired` rows are normalized to `missing`)
- Optional cache presence checks use `POST /dashboard/probe` with a bounded key list (max 20 per request)
- Dashboard includes `Warm All Missing` for backend batch warmup
- Batch warmup continues in background via `ctx.waitUntil(...)` even if the page refreshes/closes
- `Warm All Missing` progress (`done/total/active/failed`) persists in D1 state and survives reloads; UI labels this as processed count
- Running batches are resumable: stale in-flight state is recovered and the next step resumes from persisted cursor
- Stale per-session `warm_in_progress` markers are cleared automatically during recovery
- Individual row actions show `Warming...` while that row's warm request is in flight
- Warm orchestration stores in-flight state in D1 (`warm_in_progress`, `warm_started_at`) so row loaders survive page reloads and track remote work accurately
- Status column shows a single result per row: `Error` when present, otherwise `Completed`
- `Error` is rendered only while cache is still missing; once replay+telemetry are warm, stale legacy errors are cleared/suppressed
- Session identity is split into `Session Name` (year/round/type + meeting name) and `Session Key`
- `/ops/cache/auth/callback` is the Shoo callback path and resolves to the ops dashboard route

Auth:

- `Authorization: Bearer <ADMIN_TOKEN>`

### Worker Configuration

The Cloudflare Worker requires:

- D1 binding for replay cache metadata (table `replay_cache` keyed by `session_key`)
- R2 bucket for replay payload storage
- A secret used to sign short-lived upload tokens (e.g., `REPLAY_UPLOAD_SECRET`)
- A public worker URL that the frontend can call
- A replay worker edge cache (`caches.default`) for `GET /replay` hot reads

The remote warmer worker (`workers/openf1-cache-warmer`) requires:

- D1 binding for orchestration state (table `warm_session_attempts`)
- D1 state table `warm_worker_state` for deep-scan cursor bookkeeping
- `OPENF1_BASE_URL` var
- `REPLAY_WORKER_BASE_URL` var
- `CAR_TELEMETRY_WORKER_BASE_URL` var
- `DASHBOARD_ALLOWED_ORIGINS` var for browser allowlist checks
- Include both local and production dashboard origins (for example: `http://localhost:3000,http://localhost:3001,https://f1.wrick17.com,https://www.f1.wrick17.com`)
- `ADMIN_TOKEN` secret for admin routes
- `OPS_ALLOWED_EMAILS` secret for dashboard access allowlist (comma-separated)
- `SESSION_SECRET` secret for dashboard cookie signing
- `SHOO_BASE_URL` var (`https://shoo.dev` by default)

`warm_session_attempts` schema notes:

- `warm_in_progress` (`0/1`) marks active warm orchestration for a session
- `warm_started_at` records when the active warm attempt began
- `meeting_name` and `session_name` persist labels for dashboard reads without extra OpenF1 fetches

Ops auth flow:

- Frontend starts Shoo Google sign-in and requests PII (`requestPii: true`) so email is available in token claims
- Frontend posts Shoo `id_token` to `POST /auth/shoo/login`
- Worker verifies JWT signature + issuer + audience (`origin:{request_origin}`) + expiration
- Worker checks normalized email claim against normalized `OPS_ALLOWED_EMAILS`
- Worker issues `ops_session` HttpOnly cookie only for allowlisted identities

Note: If you delete/recreate the D1 database, Cloudflare will issue a new `database_id`. Update `workers/openf1-proxy/wrangler.toml` with the new `database_id` and redeploy the worker.

Frontend configuration:

- `RSBUILD_WORKER_URL` env var pointing to the worker base URL (for example: `http://127.0.0.1:8787` in local dev)
- `RSBUILD_CAR_TELEMETRY_WORKER_URL` env var pointing to the car telemetry cache worker base URL (separate D1/R2 storage from replay cache)
- `RSBUILD_CACHE_WARMER_URL` env var pointing to `openf1-cache-warmer` for `/ops/cache`
- `RSBUILD_ENABLE_REMOTE_CACHE_OPS` to allow remote ops actions from the browser (defaults to `true`)
- `RSBUILD_ENABLE_REMOTE_CACHE_PROBES` to allow bounded `/dashboard/probe` refresh probes (defaults to `true`)

Local script quota guard:

- `scripts/warm-caches/config.ts` blocks deployed `workers.dev` warm runs unless `CF_REMOTE=1` is set

Database setup:

- Apply D1 migrations from `workers/openf1-proxy/migrations`
- Example: `wrangler d1 migrations apply openf1-replay --local`
- Apply D1 migrations from `workers/openf1-cache-warmer/migrations` for remote orchestration state

## Architecture

### Data Flow

1. **Session Selection**: User selects year, round, and session type via `SessionPicker`
2. **Data Fetching**: `useReplayData` requests a replay payload from the worker; on cache miss, the client aggregates OpenF1 data and backfills the cache
3. **Data Processing**: Services transform raw API data into usable formats
4. **State Management**: Replay state managed by `useReplayController`
5. **Rendering**: Components react to state changes and display data

### API Integration

The app uses free public APIs:

- [OpenF1](https://openf1.org/) for replay telemetry and replay availability/session resolution
- [Jolpica Ergast mirror](https://api.jolpi.ca/ergast/f1) for season calendar and standings on the home dashboard
- Formula1 RSS feed (via a CORS-safe endpoint) for homepage newsroom content

Replay payloads are cached via Cloudflare Worker endpoints at `GET /replay` and `POST /replay`.
To reduce first-load failures on current-season sessions, the client prioritizes the selected replay session before background year discovery and retries transient OpenF1 `429` responses more aggressively.
When OpenF1 rate-limits the client, those retries stay in the background and do not surface a user-facing error while partial replay data is already available.

OpenF1 endpoints used by the client include:
- Meeting and session information
- Driver position data
- Telemetry (speed, gear, RPM, throttle, brake)
- Team radio communications
- Weather conditions
- Pit stop data
- Race control messages

### Caching Strategy

The application uses a write-once, read-forever caching system using Cloudflare D1 and R2:

1. **Worker Cache (D1 + R2)**: Replay payload stored in R2 with metadata in D1 by `session_key`
2. **Client Backfill**: On cache miss, the browser fetches OpenF1 data and uploads the payload to the worker
3. **Optional Client Cache**: In-memory and IndexedDB caches remain as a secondary layer
4. **Remote Warming**: Scheduled worker proactively fills missing replay + car telemetry cache entries after session end
5. **Edge Cache**: Worker `GET` responses are cached in Cloudflare edge cache (`X-Cache: EDGE`) for repeated reads

### Rate Limiting

The client performs sequential OpenF1 requests on cache miss to comply with API limits. The worker only handles cache reads and secure backfill writes.

## Components

### Core Components

#### `ReplayPage`
Main page component that orchestrates the entire replay experience. Manages state, data loading, and coordinates all child components.

#### `SessionPicker`
Allows users to select:
- Year (from available F1 seasons)
- Round (race weekend)
- Session type (Qualifying, Race)

#### `ControlsBar`
Playback controls including:
- Play/Pause button
- Speed adjustment (0.25x, 0.5x, 1x, 2x, 4x)
- Current timestamp display

#### `TimelineSlider`
Interactive timeline with:
- Draggable slider for time navigation
- Event markers (DRS, pit stops, safety car, overtakes)
- Visual indication of current playback position

#### `Leaderboard`
Shows driver standings with:
- Current position
- Driver name and number
- Team information
- Gap to leader/car ahead
- Tire compound and age
- Pit stop count

#### `TrackView`
3D visualization showing:
- Track layout
- Driver positions in real-time
- Direction of travel
- Team colors
- Deterministic driver labels with fixed-length leader lines
- Label placement that allows overlaps while keeping labels inside safe track bounds

##### Track Label Placement Logic
- Labels keep their existing pill content/structure (`position + driver name + team logo/initials`)
- Every driver has a fixed-length `5px` leader line segment from marker to label edge
- Labels are constrained to the right side of each driver marker
- Placement is deterministic (no worker-based collision solver), so labels do not jump between play/pause states
- Labels follow marker movement each frame with stable per-driver angle hysteresis
- Label overlap with other labels/markers is allowed by design
- Labels are constrained to a padded internal viewbox so they are not hidden by surrounding panels

#### `TelemetryPanel`
Displays detailed telemetry for selected driver:
- Speed (km/h)
- Gear
- RPM
- Throttle percentage
- Brake status
- DRS status
- The telemetry toggle and driver pills are only rendered after car telemetry data is available for the current session, and they appear as soon as the first usable telemetry chunk is ingested rather than waiting for the full session backfill

#### `WeatherBadge`
Shows current weather conditions:
- Air temperature
- Track temperature
- Humidity
- Wind speed and direction
- Rainfall indicator

#### `MarkerLegend`
Legend explaining timeline event markers

#### `EventMarkerPopup` & `RadioPopup`
Tooltips displaying event and radio communication details

## Hooks

### `useReplayData`
Primary data management hook that:
- Fetches aggregated session data from the worker
- Manages loading states and errors
- Provides available years and sessions
- Exposes a year only when at least one supported replay session (`Qualifying`, `Sprint`, or `Race`) has ended
- Exposes a meeting only when at least one supported replay session (`Qualifying`, `Sprint`, or `Race`) has ended
- Limits year discovery to OpenF1-supported replay seasons (`2023` onward) so the client does not probe older unavailable years
- Prioritizes the selected replay session before background year discovery so current-session pages load first
- Keeps transient OpenF1 `429` retries in the background so already-loaded replay data remains interactive
- Uses a native year select that stays interactive during in-flight replay loads so users can switch seasons without waiting for the previous request to finish
- Returns structured `ReplaySessionData`

**Usage:**
```typescript
const { data, loading, error, meetings, sessions, availableYears } = 
  useReplayData({ year, round, sessionType });
```

### `useReplayController`
Manages playback state:
- Current time tracking
- Play/pause state
- Playback speed control
- Time seeking functionality

**Usage:**
```typescript
const { currentMs, isPlaying, speed, setPlaying, setSpeed, seekTo } = 
  useReplayController({ startMs, endMs, dataRevision });
```

### `useSessionSelector`
Handles session selection logic:
- Validates year/round/session combinations
- Auto-selects the first available supported session (`Race` or `Qualifying`)
- Manages round and session options

### `useTeamRadio`
Manages team radio playback:
- Filters radio messages for current time
- Handles audio playback
- Manages popup state
- Team radio controls are hidden when the selected session has no radio clips

### `useTrackComputation`
Computes track visualization data:
- Builds 3D track geometry
- Calculates driver positions on track
- Handles track bounds and scaling

### `useUserPreferences`
Persists user preferences:
- Last selected session
- Playback speed
- UI preferences

### `useKeyboardShortcuts`
Keyboard shortcuts for power users:
- `Space`: Play/Pause
- `←/→`: Seek backward/forward
- `↑/↓`: Next/previous round
- `Shift + ↑/↓`: Next/previous year
- `Ctrl + Shift + ↑/↓`: Next/previous session
- `S`: Cycle playback speed
- `M`: Toggle team radio
- `I`: Cycle skip interval
- `E`: Expand/collapse timeline
- `T`: Toggle leaderboard telemetry

## Services

### `telemetry.service.ts`
Processes raw telemetry data:
- `computeTelemetryRows`: Builds telemetry lookup by driver and time
- `computeTelemetrySummary`: Aggregates telemetry statistics
- Interpolates missing data points

### `events.service.ts`
Manages race events:
- `buildTimelineEvents`: Creates timeline markers
- `getActiveOvertakes`: Identifies overtaking maneuvers
- Processes pit stops, safety cars, DRS zones

### `driverState.service.ts`
Tracks driver state:
- Computes standings at any given time
- Calculates gaps between drivers
- Manages tire information

### `trackBuilder.service.ts`
Builds track visualization:
- Converts GPS coordinates to 2D track
- Smooths track path
- Calculates track bounds

### `weather.service.ts`
Weather data management:
- Retrieves weather at specific timestamps
- Interpolates between weather updates

## API Integration

### OpenF1 Worker (`workers/openf1-proxy`)

The frontend calls a worker endpoint to read cached replay payloads. On cache miss, the worker returns a short-lived upload token so the browser can backfill the cache after aggregating OpenF1 data.

### Car Telemetry Worker (`workers/openf1-car-telemetry`)

Car telemetry for the Leaderboard panel (speed/gear/RPM/throttle/brake/DRS) is cached via a separate worker and separate storage to avoid polluting the replay cache. The browser fetches `GET /car-telemetry?session_key=...`; on cache miss (`202`), the browser fetches OpenF1 `car_data`, down-samples to 500ms buckets, then uploads via `POST /car-telemetry` using the provided token.

The worker also uses Cloudflare's edge cache (`caches.default`) for `200` responses to reduce repeated D1/R2 reads. You can inspect the `X-Cache` header:
- `EDGE`: served from edge cache
- `HIT`: served from the worker's D1/R2 cache

#### `GET /car-telemetry?session_key=<id>`
Behavior:
- Checks D1 for a cached payload keyed by `session_key`
- If present, streams payload from R2
- If absent, returns `202` with `{ uploadToken, expiresAt }`

#### `POST /car-telemetry`
Body:
- `session_key`: number
- `payload`: `CarTelemetryPayload`

Headers:
- `Authorization: Bearer <uploadToken>`

Behavior:
- Validates the signed token (HMAC) and expiry for the given `session_key`
- Stores payload in R2 and writes metadata to D1, then returns `204`

**Example:**
```typescript
const response = await fetch(`/car-telemetry?session_key=${sessionKey}`);
if (response.status === 202) {
  const { uploadToken } = await response.json();
  const payload = await buildCarTelemetryPayload(sessionKey);
  await fetch("/car-telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${uploadToken}`,
    },
    body: JSON.stringify({ session_key: sessionKey, payload }),
  });
}
```

### OpenF1 API Endpoints

These endpoints are called directly from the client (not via the worker).

- `meetings`: Race weekend information
- `sessions`: Session details
- `drivers`: Driver information
- `position`: Driver positions over time
- `location`: GPS coordinates
- `car_data`: Telemetry data (speed, RPM, gear, etc.)
- `race_control`: Race director messages
- `team_radio`: Team radio communications
- `weather`: Weather conditions
- `pit`: Pit stop data

## Testing

The project includes unit tests located in the `test/unittests/` directory.

### Running Tests

```bash
# Run unit tests (default)
bun run test

# Run visual layout tests
bun run test:visual

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test test/unittests/specific-test.ts
```

### Testing Approach
- Unit tests for services and utilities
- Component testing for UI components
- Integration tests for API client
- Manual smoke testing for end-to-end flows
- Visual tests validate track/label safety against app panels and fixed-length leader-line consistency

### Manual Smoke Test

1. Select the latest replayable year and round, and confirm the session picker only shows `Race` and `Qualifying`
2. Wait for telemetry data to load
3. Press Play button
4. Verify:
   - Cars animate on track view
   - Leaderboard updates in real-time
   - Telemetry panel shows speed/gear data
   - Timeline markers are visible
   - Weather badge displays correctly

## Contributing

### Development Workflow

1. **Fork & Clone**: Fork the repository and clone locally
2. **Create Branch**: `git checkout -b feature/your-feature-name`
3. **Make Changes**: Implement your feature or fix
4. **Test**: Ensure all tests pass and app works correctly
5. **Lint & Format**: Run `bun run lint:fix` and `bun run format`
6. **Commit**: Write clear, descriptive commit messages
7. **Push**: Push to your fork
8. **Pull Request**: Open a PR with detailed description

### Code Style

This project uses Biome for linting and formatting:
- Follow TypeScript best practices
- Use functional components and hooks
- Keep components small and focused
- Write descriptive variable and function names
- Add comments for complex logic
- Maintain consistent file structure

### Directory Conventions

- **Components**: One component per file, PascalCase naming
- **Hooks**: Custom hooks start with `use`, camelCase naming
- **Services**: Business logic in services, `*.service.ts` naming
- **Types**: TypeScript definitions in `types/` folders
- **Utils**: Helper functions in `utils/` folders

### Performance Considerations

- Use `useMemo` and `useCallback` for expensive computations
- Implement virtualization for large lists
- Lazy load heavy components
- Optimize re-renders with React DevTools
- Minimize bundle size by code splitting

### Accessibility

- Use semantic HTML elements
- Provide ARIA labels where needed
- Ensure keyboard navigation works
- Test with screen readers
- Maintain sufficient color contrast

## License

This project is licensed under the terms specified in the repository.

## Data Attribution

Data provided by [OpenF1](https://openf1.org/), an open-source F1 telemetry API.

## Support

For issues, questions, or contributions, please use the GitHub repository issue tracker.

---

Built with ❤️ by the F1 Replay team
