import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { buildSessionArchive } from "../../src/modules/archive";
import type { CarTelemetryPayload } from "../../src/modules/replay/types/carTelemetry.types";
import type { ReplaySessionData } from "../../src/modules/replay/types/openf1.types";

const YEAR = 2025;
const ROUND = 24;
const ROUTE = `/${YEAR}/${ROUND}/race/replay`;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const START_MS = Date.parse("2025-03-16T05:00:00Z");
const END_MS = START_MS + 420_000;
const TRACK_POINTS = Array.from({ length: 24 }, (_, index) => {
  const angle = (index / 24) * Math.PI * 2;
  return [Math.cos(angle) * 120, Math.sin(angle) * 80] as [number, number];
});
const SAMPLE_OFFSETS = [
  0,
  1_000,
  2_000,
  60_000,
  61_000,
  62_000,
  240_000,
  241_000,
  242_000,
  419_000,
];
const CAR_OFFSETS = [0, 500, 180_000, 180_500, 419_500];
const runVisualSuite = process.env.RUN_VISUAL_TESTS === "1";
const DRIVER_NUMBERS = [1, 2] as const;

const withTimestamp = <T extends object>(offset: number, value: T) => ({
  date: new Date(START_MS + offset).toISOString(),
  timestampMs: START_MS + offset,
  meeting_key: 7,
  session_key: 9,
  ...value,
});

const makeLocations = (driverNumber: number) =>
  SAMPLE_OFFSETS.map((offset, index) => {
    const [x, y] = TRACK_POINTS[(index + driverNumber * 3) % TRACK_POINTS.length] ?? [0, 0];
    const timestampMs = START_MS + offset;
    return {
      date: new Date(timestampMs).toISOString(),
      timestampMs,
      meeting_key: 7,
      session_key: 9,
      driver_number: driverNumber,
      x,
      y,
      z: 0,
    };
  });

const makeCarSamples = (driverNumber: number) =>
  CAR_OFFSETS.map((offset) => ({
    timestampMs: START_MS + offset,
    speed: 180 + driverNumber * 10,
    gear: 6,
    rpm: 10_000,
    throttle: 80,
    brake: 0,
    drs: 8,
  }));

const drivers = DRIVER_NUMBERS.map((driverNumber) => ({
  driver_number: driverNumber,
  full_name: driverNumber === 1 ? "Alex Example" : "Casey Example",
  name_acronym: driverNumber === 1 ? "AEX" : "CEX",
  team_name: "Example Racing",
  team_colour: driverNumber === 1 ? "e10600" : "00aaff",
  headshot_url: null,
})) satisfies ReplaySessionData["drivers"];

const telemetryByDriver = Object.fromEntries(
  DRIVER_NUMBERS.map((driverNumber) => [
    driverNumber,
    {
      locations: makeLocations(driverNumber),
      positions: SAMPLE_OFFSETS.map((offset) =>
        withTimestamp(offset, { driver_number: driverNumber, position: driverNumber }),
      ),
      stints: [{ driver_number: driverNumber, compound: driverNumber === 1 ? "MEDIUM" : "SOFT", lap_start: 1, lap_end: 20 }],
      laps: [],
    },
  ]),
) as ReplaySessionData["telemetryByDriver"];

const replayFixture = {
  trackGeometry: { points: TRACK_POINTS, rotation: 0, source: "circuit" as const },
  meeting: {
    meeting_key: 7,
    meeting_name: "Australian Grand Prix",
    meeting_official_name: "FORMULA 1 AUSTRALIAN GRAND PRIX 2025",
    year: YEAR,
    country_name: "Australia",
    circuit_short_name: "Melbourne",
    date_start: "2025-03-14T01:30:00Z",
    date_end: "2025-03-16T06:00:00Z",
  },
  session: {
    session_key: 9,
    meeting_key: 7,
    session_name: "Race",
    session_type: "Race",
    date_start: new Date(START_MS).toISOString(),
    date_end: new Date(END_MS).toISOString(),
    year: YEAR,
  },
  drivers,
  telemetryByDriver,
  sessionStartMs: START_MS,
  sessionEndMs: END_MS,
  teamRadios: [],
  overtakes: [
    withTimestamp(30_000, {
      overtaking_driver_number: 1,
      overtaken_driver_number: 2,
      position: 1,
    }),
  ],
  weather: [],
  raceControl: [
    withTimestamp(90_000, {
      category: "Flag",
      flag: "YELLOW",
      driver_number: null,
      lap_number: 4,
      message: "Yellow flag in sector 1",
      scope: "Sector",
      sector: 1,
    }),
  ],
  pits: [
    withTimestamp(200_000, {
      driver_number: 2,
      lap_number: 9,
      pit_duration: 22.4,
    }),
  ],
} satisfies ReplaySessionData;

const carFixture = {
  sessionKey: 9,
  sampleIntervalMs: 500,
  createdAt: "2025-03-16T06:00:00Z",
  byDriver: Object.fromEntries(
    DRIVER_NUMBERS.map((driverNumber) => [driverNumber, makeCarSamples(driverNumber)]),
  ) as CarTelemetryPayload["byDriver"],
} satisfies CarTelemetryPayload;

const isServerLive = (url: string) =>
  new Promise<boolean>((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1_000, () => {
      request.destroy();
      resolve(false);
    });
  });

const waitForServer = async (url: string) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isServerLive(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server not ready at ${url}`);
};

const getFreePort = async () => {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  if (!port) throw new Error("Could not allocate a port");
  return port;
};

const waitFor = async (check: () => Promise<boolean>, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the replay state");
};

const getFiniteRect = async (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
  });

describe("replay visual fixture", () => {
  it("builds and serves the selected archive locally", async () => {
    const archive = await buildSessionArchive(replayFixture, {
      round: ROUND,
      car: carFixture,
      chunkMs: 180_000,
      updatedAt: "2025-03-16T07:00:00Z",
    });
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname.slice(1);
        const content = archive.files.get(path);
        return content === undefined
          ? new Response("missing", { status: 404 })
          : new Response(content, { headers: { "content-type": "application/json" } });
      },
    });
    try {
      const response = await fetch(`${server.url}catalog.json`);
      expect(response.ok).toBe(true);
      expect(await response.json()).toMatchObject({
        sessions: [{ year: YEAR, round: ROUND, type: "Race" }],
      });
    } finally {
      server.stop(true);
    }
  });
});

const runVisualSuiteIfEnabled = runVisualSuite ? describe : describe.skip;

runVisualSuiteIfEnabled("replay visual smoke", () => {
  let archive: Awaited<ReturnType<typeof buildSessionArchive>>;
  let archiveServer: ReturnType<typeof Bun.serve> | null = null;
  let devServer: ChildProcess | null = null;
  let browser: Browser | null = null;
  let appOrigin = "";
  const archiveRequests: string[] = [];

  beforeAll(async () => {
    archive = await buildSessionArchive(replayFixture, {
      round: ROUND,
      car: carFixture,
      chunkMs: 180_000,
      updatedAt: "2025-03-16T07:00:00Z",
    });
    archiveServer = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname.slice(1);
        archiveRequests.push(`/${path}`);
        const content = archive.files.get(path);
        return content === undefined
          ? new Response("missing", { status: 404 })
          : new Response(content, { headers: { "content-type": "application/json" } });
      },
    });
    const port = await getFreePort();
    appOrigin = `http://127.0.0.1:${port}`;
    devServer = spawn("bun", ["run", "dev"], {
      env: {
        ...process.env,
        PORT: String(port),
        RSBUILD_ARCHIVE_URL: archiveServer.url.toString(),
      },
      stdio: "ignore",
    });
    await waitForServer(`${appOrigin}/`);
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    devServer?.kill("SIGTERM");
    archiveServer?.stop(true);
  });

  it(
    "keeps the replay route usable on desktop and mobile",
    async () => {
      if (!browser || !archiveServer) throw new Error("Visual suite was not initialized");
      const archiveOrigin = archiveServer.url.origin;
      const archivePaths = new Set([...archive.files.keys()].map((path) => `/${path}`));
      const carChunkPaths = new Set(
        (archive.manifest.car?.chunks ?? []).map((chunk) => `/${chunk.url}`),
      );

      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          baseURL: appOrigin,
        });
        const page = await context.newPage();
        const browserRequests: string[] = [];
        page.on("request", (request) => browserRequests.push(request.url()));
        page.setDefaultTimeout(30_000);
        try {
          await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("svg[aria-label='F1 circuit and driver positions']");
          await page.waitForSelector("input[type='range'][aria-label='Replay timeline']");
          await page.waitForFunction(
            () =>
              document.querySelectorAll(
                "svg[aria-label='F1 circuit and driver positions'] g[role='button']",
              ).length >= 2,
            undefined,
            { timeout: 60_000 },
          );
          expect(page.url()).toContain(ROUTE);

          for (const selector of [
            "header",
            "footer",
            "[data-testid='events-panel']",
            "[data-testid='telemetry-panel']",
            "svg[aria-label='F1 circuit and driver positions']",
            "input[type='range'][aria-label='Replay timeline']",
          ]) {
            const rect = await getFiniteRect(page, selector);
            expect(Number.isFinite(rect.left)).toBe(true);
            expect(Number.isFinite(rect.top)).toBe(true);
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
          }

          const overflow = await page.evaluate(
            () =>
              Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
              window.innerWidth,
          );
          expect(overflow).toBeLessThanOrEqual(1);

          const driver = page
            .locator("svg[aria-label='F1 circuit and driver positions'] g[role='button']")
            .first();
          await driver.focus();
          expect(await driver.evaluate((element) => document.activeElement === element)).toBe(true);

          const slider = page.getByRole("slider", { name: "Replay timeline" });
          const beforeSeek = Number(await slider.inputValue());
          await slider.press("ArrowRight");
          await waitFor(async () => Number(await slider.inputValue()) > beforeSeek);

          await page.getByRole("button", { name: "Play replay" }).click();
          await waitFor(
            async () => (await page.getByRole("button", { name: "Pause replay" }).count()) > 0,
          );
          await page.getByRole("button", { name: "Pause replay" }).click();

          await slider.press("End");
          await waitFor(async () => Number(await slider.inputValue()) === END_MS);
          const lastLocation = archive.manifest.locations.at(-1);
          if (!lastLocation) throw new Error("Fixture has no final location chunk");
          await waitFor(async () => archiveRequests.includes(`/${lastLocation.url}`));
          expect(
            await page
              .locator("svg[aria-label='F1 circuit and driver positions'] g[role='button']")
              .count(),
          ).toBeGreaterThanOrEqual(2);

          const carRequestsBefore = archiveRequests.filter((path) => carChunkPaths.has(path)).length;
          await page.getByRole("button", { name: "TELEMETRY" }).click();
          await waitFor(
            async () =>
              archiveRequests.filter((path) => carChunkPaths.has(path)).length > carRequestsBefore,
          );

          for (const requestUrl of browserRequests) {
            const origin = new URL(requestUrl).origin;
            expect([appOrigin, archiveOrigin]).toContain(origin);
          }
          expect([...archiveRequests].every((path) => archivePaths.has(path))).toBe(true);
        } finally {
          await context.close();
        }
      }
    },
    180_000,
  );
});
