import { describe, expect, it } from "bun:test";
import {
  buildSessionArchive,
  findChunkAt,
  loadArchivedTrackGeometry,
  loadCatalog,
  loadLocationChunk,
  loadManifest,
  loadReplayCore,
  loadReplaySession,
  validateBuiltArchive,
  validateCore,
  validateCatalog,
} from "../../../../src/modules/archive";
import type { CarTelemetryPayload } from "../../../../src/modules/replay/types/carTelemetry.types";
import type { ReplaySessionData } from "../../../../src/modules/replay/types/openf1.types";

const replay = {
  trackGeometry: {
    points: [
      [0, 0],
      [1, 1],
      [2, 0],
    ],
    pitLane: [[0, 0], [1, -0.2], [2, 0]],
    rotation: 0,
    source: "circuit",
  },
  meeting: {
    meeting_key: 7,
    meeting_name: "Test Grand Prix",
    meeting_official_name: "FORMULA 1 TEST GRAND PRIX",
    year: 2025,
    country_name: "Testland",
    circuit_short_name: "Test Circuit",
    date_start: "2025-01-01T00:00:00Z",
    date_end: "2025-01-02T00:00:00Z",
  },
  session: {
    session_key: 9,
    meeting_key: 7,
    session_name: "Race",
    session_type: "Race",
    date_start: "2025-01-01T12:00:00Z",
    date_end: "2025-01-01T12:10:00Z",
    year: 2025,
  },
  drivers: [
    {
      driver_number: 1,
      full_name: "One Driver",
      name_acronym: "ONE",
      team_name: "Team",
      team_colour: "ffffff",
      headshot_url: null,
    },
    {
      driver_number: 2,
      full_name: "Two Driver",
      name_acronym: "TWO",
      team_name: "Team",
      team_colour: "ffffff",
      headshot_url: null,
    },
  ],
  telemetryByDriver: {
    1: {
      locations: [0, 59_900, 60_100].map((offset, index) => ({
        date: new Date(Date.parse("2025-01-01T12:00:00Z") + offset).toISOString(),
        meeting_key: 7,
        session_key: 9,
        driver_number: 1,
        x: index,
        y: index + 1,
        z: 0,
        timestampMs: Date.parse("2025-01-01T12:00:00Z") + offset,
      })),
      positions: [],
      stints: [],
      laps: [],
    },
    2: {
      locations: [1_000, 61_000].map((offset, index) => ({
        date: new Date(Date.parse("2025-01-01T12:00:00Z") + offset).toISOString(),
        meeting_key: 7,
        session_key: 9,
        driver_number: 2,
        x: index + 10,
        y: index + 11,
        z: 0,
        timestampMs: Date.parse("2025-01-01T12:00:00Z") + offset,
      })),
      positions: [],
      stints: [],
      laps: [],
    },
  },
  sessionStartMs: Date.parse("2025-01-01T12:00:00Z"),
  sessionEndMs: Date.parse("2025-01-01T12:10:00Z"),
  teamRadios: [],
  overtakes: [],
  weather: [],
  raceControl: [],
  pits: [],
} satisfies ReplaySessionData;

const car = {
  sessionKey: 9,
  sampleIntervalMs: 500,
  createdAt: "2025-01-01T13:00:00Z",
  byDriver: {
    1: [
      { timestampMs: replay.sessionStartMs, speed: 1, gear: 2, rpm: 3, throttle: 4, brake: 5, drs: 6 },
      {
        timestampMs: replay.sessionStartMs + 60_500,
        speed: 7,
        gear: 8,
        rpm: 9,
        throttle: 10,
        brake: 11,
        drs: 12,
      },
    ],
  },
} satisfies CarTelemetryPayload;

const knownDrivers = new Set(Object.keys(replay.telemetryByDriver).map(Number));

const sha256Hex = async (content: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

describe("static replay archive", () => {
  it("rejects malformed generated tuples before publication", async () => {
    const malformed = structuredClone(replay) as ReplaySessionData;
    (malformed.telemetryByDriver[1].locations[0] as { x: number | undefined }).x = undefined;
    const archive = await buildSessionArchive(malformed, { round: 24 });
    expect(() => validateBuiltArchive(archive)).toThrow("chunk.samples[0] is invalid");
  });

  it("sorts time-indexed core samples and omits unusable timestamps without mutating input", async () => {
    const source = structuredClone(replay) as ReplaySessionData;
    source.telemetryByDriver[1].laps = [
      {
        driver_number: 1,
        lap_number: 2,
        date_start: "2025-01-01T12:02:00Z",
        lap_duration: 60,
        is_pit_out_lap: false,
        timestampMs: replay.sessionStartMs + 120_000,
      },
      {
        driver_number: 1,
        lap_number: 1,
        date_start: "",
        lap_duration: 0,
        is_pit_out_lap: true,
        timestampMs: Number.NaN,
      },
      {
        driver_number: 1,
        lap_number: 3,
        date_start: "2025-01-01T12:01:00Z",
        lap_duration: 60,
        is_pit_out_lap: false,
        timestampMs: replay.sessionStartMs + 60_000,
      },
    ];
    source.raceControl = [
      { meeting_key: 7, session_key: 9, date: "b", category: "Flag", message: "b", timestampMs: 2 },
      { meeting_key: 7, session_key: 9, date: "a", category: "Flag", message: "a", timestampMs: 1 },
    ];
    const archive = await buildSessionArchive(source, { round: 24 });
    expect(() => validateBuiltArchive(archive)).not.toThrow();
    const core = JSON.parse(archive.files.get(archive.manifest.core.url) ?? "null");
    expect(core.payload.telemetryByDriver[1].laps.map((lap: { lap_number: number }) => lap.lap_number)).toEqual([
      3,
      2,
    ]);
    expect(core.payload.raceControl.map((event: { message: string }) => event.message)).toEqual([
      "a",
      "b",
    ]);
    expect(source.telemetryByDriver[1].laps.map((lap) => lap.lap_number)).toEqual([2, 1, 3]);
    expect(source.raceControl.map((event) => event.message)).toEqual(["b", "a"]);
  });

  it("keeps car samples for substitute drivers absent from replay core", async () => {
    const substituteCar = structuredClone(car) as CarTelemetryPayload;
    substituteCar.byDriver[99] = [
      {
        timestampMs: replay.sessionStartMs,
        speed: 1,
        gear: 1,
        rpm: 1,
        throttle: 1,
        brake: 0,
        drs: 0,
      },
    ];
    const archive = await buildSessionArchive(replay, { round: 24, car: substituteCar });
    expect(() => validateBuiltArchive(archive)).not.toThrow();
  });

  it("classifies sessions by exact session name and enforces catalog consistency", async () => {
    const sprint = await buildSessionArchive(
      { ...replay, session: { ...replay.session, session_name: "Sprint", session_type: "Race" } },
      { round: 2 },
    );
    expect(sprint.catalog.sessions[0].type).toBe("Sprint");
    expect(() =>
      validateCatalog({
        ...sprint.catalog,
        sessions: sprint.catalog.sessions.map((session) => ({ ...session, type: "Race" })),
      }),
    ).toThrow("type does not match session name");
    await expect(
      buildSessionArchive(
        {
          ...replay,
          session: {
            ...replay.session,
            session_name: "Sprint Qualifying",
            session_type: "Qualifying",
          },
        },
        { round: 2 },
      ),
    ).rejects.toThrow("unsupported archive session");
  });

  it("does not reuse track geometry from mismatched core metadata", async () => {
    const archive = await buildSessionArchive(replay, { round: 24 });
    const core = JSON.parse(archive.files.get(archive.manifest.core.url) ?? "null");
    core.payload.meeting.meeting_key = 999;
    const content = JSON.stringify(core);
    const hash = await sha256Hex(content);
    const manifest = {
      ...archive.manifest,
      core: { url: `objects/${hash}.json`, sha256: hash, bytes: new TextEncoder().encode(content).byteLength },
    };
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(content);
      },
    });
    try {
      await expect(loadArchivedTrackGeometry(`${server.url}catalog.json`, manifest)).rejects.toThrow(
        "core metadata key mismatch",
      );
    } finally {
      server.stop(true);
    }
  });

  it("loads core and guarded chunks over HTTP, then reconstructs every owned sample", async () => {
    const archive = await buildSessionArchive(replay, {
      round: 24,
      car,
      updatedAt: "2025-01-01T13:00:00Z",
    });
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const content = archive.files.get(new URL(request.url).pathname.slice(1));
        return content === undefined
          ? new Response("missing", { status: 404 })
          : new Response(content, { headers: { "content-type": "application/json" } });
      },
    });

    try {
      const catalogUrl = `${server.url}catalog.json`;
      const catalog = await loadCatalog(catalogUrl);
      expect(catalog.sessions[0]).toMatchObject({ year: 2025, round: 24, sessionKey: 9 });
      const manifest = await loadManifest(catalogUrl, catalog.sessions[0]);
      const core = await loadReplayCore(catalogUrl, manifest);
      expect(core.telemetryByDriver[1].locations).toEqual([]);
      expect(core.trackGeometry).toEqual(replay.trackGeometry);

      const second = findChunkAt(manifest.locations, replay.sessionStartMs + 60_100);
      if (!second) throw new Error("second location chunk missing");
      const window = await loadLocationChunk(catalogUrl, manifest, second, knownDrivers);
      expect(window[1].map((sample) => sample.timestampMs)).toEqual([
        replay.sessionStartMs + 59_900,
        replay.sessionStartMs + 60_100,
      ]);
      expect(window[2].map((sample) => sample.timestampMs)).toEqual([
        replay.sessionStartMs + 1_000,
        replay.sessionStartMs + 61_000,
      ]);

      const loaded = await loadReplaySession(catalogUrl, catalog.sessions[0]);
      expect(loaded.data.telemetryByDriver[1].locations).toEqual(
        replay.telemetryByDriver[1].locations.map((sample) => ({
          ...sample,
          date: new Date(sample.timestampMs).toISOString(),
        })),
      );
      expect(loaded.data.telemetryByDriver[2].locations).toHaveLength(2);
      expect(loaded.car).toEqual(car);
    } finally {
      server.stop(true);
    }
  });

  it("rejects content that does not match its immutable URL", async () => {
    const archive = await buildSessionArchive(replay, { round: 24 });
    const manifestObject = archive.catalog.sessions[0].manifest;
    archive.files.set(manifestObject.url, "{}");
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        return new Response(archive.files.get(new URL(request.url).pathname.slice(1)) ?? "missing");
      },
    });
    try {
      const catalogUrl = `${server.url}catalog.json`;
      const catalog = await loadCatalog(catalogUrl);
      await expect(loadManifest(catalogUrl, catalog.sessions[0], { retries: 0 })).rejects.toThrow(
        "byte size mismatch",
      );
    } finally {
      server.stop(true);
    }
  });

  it("uses a recent last-known catalog when the network is unavailable", async () => {
    const archive = await buildSessionArchive(replay, { round: 24 });
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } as Storage;
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(archive.files.get("catalog.json"));
      },
    });
    const catalogUrl = `${server.url}catalog.json`;
    const catalog = await loadCatalog(catalogUrl, { storage, retries: 0 });
    server.stop(true);
    expect(await loadCatalog(catalogUrl, { storage, retries: 0 })).toEqual(catalog);
  });

  it("falls back to the bundled catalog while keeping immutable reads on the data host", async () => {
    const archive = await buildSessionArchive(replay, { round: 24 });
    const catalogUrl = "https://data.f1.wrick17.com/catalog.json";
    const appOrigin = "https://f1.wrick17.com";
    const bundledUrl = `${appOrigin}/archive/catalog.json`;
    const requests: string[] = [];
    const originalFetch = globalThis.fetch;
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(appOrigin),
    });
    try {
      globalThis.fetch = async (input) => {
        const url = String(input);
        requests.push(url);
        if (url === catalogUrl) return new Response("offline", { status: 503 });
        if (url === bundledUrl) return new Response(archive.files.get("catalog.json"));
        const parsed = new URL(url);
        if (parsed.origin === "https://data.f1.wrick17.com") {
          const content = archive.files.get(parsed.pathname.slice(1));
          return content === undefined
            ? new Response("missing", { status: 404 })
            : new Response(content);
        }
        return new Response("missing", { status: 404 });
      };

      expect(typeof localStorage).toBe("undefined");
      const catalog = await loadCatalog(catalogUrl, { retries: 0 });
      const manifest = await loadManifest(catalogUrl, catalog.sessions[0], { retries: 0 });
      const core = await loadReplayCore(catalogUrl, manifest, { retries: 0 });
      expect(core.session.session_key).toBe(replay.session.session_key);
      expect(requests).toEqual([
        catalogUrl,
        bundledUrl,
        new URL(catalog.sessions[0].manifest.url, catalogUrl).href,
        new URL(manifest.core.url, catalogUrl).href,
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
      else Reflect.deleteProperty(globalThis, "location");
    }
  });

  it("keeps network-only catalog checks off local fallbacks", async () => {
    const catalogUrl = "https://data.f1.wrick17.com/catalog.json";
    const requests: string[] = [];
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input) => {
        requests.push(String(input));
        return new Response("offline", { status: 503 });
      };
      await expect(
        loadCatalog(catalogUrl, { retries: 0, networkOnly: true }),
      ).rejects.toThrow("Archive request failed: 503");
      expect(requests).toEqual([catalogUrl]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates caller cancellation through the bounded request signal", async () => {
    const controller = new AbortController();
    const originalFetch = globalThis.fetch;
    let requestSignal: AbortSignal | null | undefined;
    try {
      globalThis.fetch = async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal;
          requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
            once: true,
          });
        });
      const pending = loadCatalog("https://archive.test/catalog.json", {
        signal: controller.signal,
        retries: 0,
        networkOnly: true,
      });
      expect(requestSignal).not.toBe(controller.signal);
      controller.abort();
      await expect(pending).rejects.toHaveProperty("name", "AbortError");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("cancels an oversized chunk stream before buffering the full response", async () => {
    const archive = await buildSessionArchive(replay, { round: 24 });
    const descriptor = archive.manifest.locations[0];
    const originalFetch = globalThis.fetch;
    let pulls = 0;
    let cancelled = false;
    try {
      globalThis.fetch = async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              pulls += 1;
              controller.enqueue(new Uint8Array(1_000_000));
              if (pulls === 20) controller.close();
            },
            cancel() {
              cancelled = true;
            },
          }),
        );

      await expect(
        loadLocationChunk(
          "https://archive.test/catalog.json",
          archive.manifest,
          descriptor,
          knownDrivers,
          { retries: 0 },
        ),
      ).rejects.toThrow("response is too large");
      expect(cancelled).toBe(true);
      expect(pulls).toBeLessThan(20);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects a location chunk containing a driver absent from replay core", async () => {
    const archive = await buildSessionArchive(replay, { round: 24 });
    const original = archive.manifest.locations[0];
    const encoded = JSON.parse(archive.files.get(original.url) ?? "null") as {
      samples: number[][];
    };
    encoded.samples[0][1] = 99;
    const content = JSON.stringify(encoded);
    const sha256 = await sha256Hex(content);
    const descriptor = {
      ...original,
      url: `objects/${sha256}.json`,
      sha256,
      bytes: new TextEncoder().encode(content).byteLength,
    };
    const manifest = { ...archive.manifest, locations: [descriptor] };
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(content);
      await expect(
        loadLocationChunk(
          "https://archive.test/catalog.json",
          manifest,
          descriptor,
          knownDrivers,
          { retries: 0 },
        ),
      ).rejects.toThrow("unknown driver 99");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


it("validates optional pit-lane points without requiring them in older cores", async () => {
  const archive = await buildSessionArchive(replay, { round: 24 });
  const core = JSON.parse(archive.files.get(archive.manifest.core.url)!);
  expect(() => validateCore(core, archive.manifest)).not.toThrow();
  delete core.payload.trackGeometry.pitLane;
  expect(() => validateCore(core, archive.manifest)).not.toThrow();
  for (const invalid of [[], [[0, 0]], [[0, 0], [1, null], [2, 0]], [[0, 0, 0], [1, 0], [2, 0]]]) {
    core.payload.trackGeometry.pitLane = invalid;
    expect(() => validateCore(core, archive.manifest)).toThrow("trackGeometry.pitLane");
  }
});
