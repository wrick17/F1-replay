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

F1 Replay is a replay viewer for Formula 1 telemetry data. Built with React and powered by the OpenF1 API, this application uses a Cloudflare Worker to cache replay payloads so users can visualize and replay F1 race sessions with telemetry data, driver positions, team radio communications, and weather conditions.

## Features

### 🏎️ Race Replay
- **Time-based Playback**: Scrub through any F1 session with a dynamic timeline
- **Playback Controls**: Play, pause, and adjust playback speed (0.25x to 4x)
- **Live Leaderboard**: Real-time driver standings with positions, gaps, and tire information
- **3D Track View**: Visual representation of driver positions on the track

### 📊 Telemetry & Data
- **Event Markers**: Visual indicators for DRS zones, pit stops, safety cars, and overtakes
- **Events Panel**: Left-side chronological event list with timestamp, click-to-seek, active-event red line, playback auto-scroll, inline radio player controls, plus Legend/Shortcuts sections below the list
- **Leaderboard Telemetry Toggle**: Optional per-driver car telemetry pills (speed/gear/RPM/throttle/brake/DRS) inside the Leaderboard panel
- **Weather Data**: Live weather conditions including air/track temperature, humidity, and rainfall
- **Team Radio**: Listen to team radio communications with timestamp markers

### 🎯 User Experience
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
- **History API + URLSearchParams**: Query-param based session state (`year`, `round`, `session`) on a single-page mount at `/`

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
│   └── modules/
│       └── replay/            # Main replay module
│           ├── index.ts
│           ├── pages/         # Page components
│           │   └── ReplayPage.tsx
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
bun run warm:cache
bun run warm:telemetry-cache
```

### Worker Configuration

The Cloudflare Worker requires:

- D1 binding for replay cache metadata (table `replay_cache` keyed by `session_key`)
- R2 bucket for replay payload storage
- A secret used to sign short-lived upload tokens (e.g., `REPLAY_UPLOAD_SECRET`)
- A public worker URL that the frontend can call

Note: If you delete/recreate the D1 database, Cloudflare will issue a new `database_id`. Update `workers/openf1-proxy/wrangler.toml` with the new `database_id` and redeploy the worker.

Frontend configuration:

- `RSBUILD_WORKER_URL` env var pointing to the worker base URL (for example: `http://127.0.0.1:8787` in local dev)
- `RSBUILD_CAR_TELEMETRY_WORKER_URL` env var pointing to the car telemetry cache worker base URL (separate D1/R2 storage from replay cache)

Database setup:

- Apply D1 migrations from `workers/openf1-proxy/migrations`
- Example: `wrangler d1 migrations apply openf1-replay --local`

## Architecture

### Data Flow

1. **Session Selection**: User selects year, round, and session type via `SessionPicker`
2. **Data Fetching**: `useReplayData` requests a replay payload from the worker; on cache miss, the client aggregates OpenF1 data and backfills the cache
3. **Data Processing**: Services transform raw API data into usable formats
4. **State Management**: Replay state managed by `useReplayController`
5. **Rendering**: Components react to state changes and display data

### API Integration

The app calls the [OpenF1 API](https://openf1.org/) directly for live data and uses a Cloudflare Worker for replay caching at `GET /replay` and `POST /replay`.

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
- Session type (Practice, Qualifying, Sprint, Race)

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
- Auto-selects latest available session
- Manages round and session options

### `useTeamRadio`
Manages team radio playback:
- Filters radio messages for current time
- Handles audio playback
- Manages popup state

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
- Number keys: Adjust playback speed

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

#### `GET /replay?session_key=<id>`
Behavior:
- Checks D1 for a cached payload keyed by `session_key`
- If present, streams payload from R2 (or legacy D1 payload if present)
- If absent, returns `202` with `{ uploadToken, expiresAt }`

#### `POST /replay`
Body:
- `session_key`: number
- `payload`: `ReplaySessionData`

Headers:
- `Authorization: Bearer <uploadToken>`

Behavior:
- Validates the signed token (HMAC) and expiry for the given `session_key`
- Stores payload in R2 and writes metadata to D1, then returns `204`

**Example:**
```typescript
const response = await fetch(`/replay?session_key=${sessionKey}`);
if (response.status === 202) {
  const { uploadToken } = await response.json();
  const payload = await buildReplayPayload(sessionKey);
  await fetch("/replay", {
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

1. Select the latest year and round with a Race session
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
