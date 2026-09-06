import { describe, expect, it } from "bun:test";
import {
  decodeLegacyCar,
  decodeLegacyReplay,
  loadExistingCatalog,
  mergeCatalog,
  normalizeExistingCatalog,
  officialRound,
  parsePublisherArgs,
  preflightR2,
  publishArchiveObjects,
  publishCatalog,
} from "../../../../scripts/archive/publish";
import {
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveCatalog,
  type ArchiveManifest,
  type BuiltArchive,
} from "../../../../src/modules/archive";

const session = (sessionKey: number) => ({
  year: 2025,
  round: 24,
  sessionKey,
  meetingKey: 7,
  type: "Race" as const,
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
    session_key: sessionKey,
    meeting_key: 7,
    session_name: "Race",
    session_type: "Race",
    date_start: "2025-01-02T12:00:00Z",
    date_end: "2025-01-02T14:00:00Z",
    year: 2025,
  },
  status: { replay: "ready" as const, car: "unavailable" as const },
  manifest: { url: `objects/${"a".repeat(64)}.json`, sha256: "a".repeat(64), bytes: 1 },
});

describe("archive publisher", () => {
  it("replaces a stable route without dropping other catalog sessions", () => {
    const existing: ArchiveCatalog = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      updatedAt: "old",
      sessions: [session(1), { ...session(2), round: 23 }],
    };
    const merged = mergeCatalog(existing, [session(3)], "new");
    expect(merged.sessions.map((item) => item.sessionKey)).toEqual([2, 3]);
    expect(merged.updatedAt).toBe("new");
  });

  it("publishes immutable objects before the mutable catalog", async () => {
    const calls: Array<{ path: string; immutable: boolean }> = [];
    let active = 0;
    let maxActive = 0;
    const manifestPath = `objects/${"b".repeat(64)}.json`;
    const archive = {
      files: new Map([
        [manifestPath, "manifest"],
        [`objects/${"a".repeat(64)}.json`, "object"],
        [`objects/${"c".repeat(64)}.json`, "object"],
        [`objects/${"d".repeat(64)}.json`, "object"],
        [`objects/${"e".repeat(64)}.json`, "object"],
        [`objects/${"f".repeat(64)}.json`, "object"],
        [`objects/${"1".repeat(64)}.json`, "object"],
        [`objects/${"2".repeat(64)}.json`, "object"],
        [`objects/${"3".repeat(64)}.json`, "object"],
        [`objects/${"4".repeat(64)}.json`, "object"],
        ["catalog.json", "session catalog"],
      ]),
      catalog: { sessions: [{ manifest: { url: manifestPath } }] },
    } as BuiltArchive;
    const upload = async (path: string, _content: string, immutable: boolean) => {
      calls.push({ path, immutable });
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(1);
      active -= 1;
    };
    await publishArchiveObjects(archive, upload);
    await publishCatalog(
      { schemaVersion: ARCHIVE_SCHEMA_VERSION, updatedAt: "now", sessions: [] },
      upload,
    );
    expect(calls).toEqual([
      { path: `objects/${"a".repeat(64)}.json`, immutable: true },
      { path: `objects/${"c".repeat(64)}.json`, immutable: true },
      { path: `objects/${"d".repeat(64)}.json`, immutable: true },
      { path: `objects/${"e".repeat(64)}.json`, immutable: true },
      { path: `objects/${"f".repeat(64)}.json`, immutable: true },
      { path: `objects/${"1".repeat(64)}.json`, immutable: true },
      { path: `objects/${"2".repeat(64)}.json`, immutable: true },
      { path: `objects/${"3".repeat(64)}.json`, immutable: true },
      { path: `objects/${"4".repeat(64)}.json`, immutable: true },
      { path: manifestPath, immutable: true },
      { path: "catalog.json", immutable: false },
    ]);
    expect(maxActive).toBe(8);
  });

  it("reuses unchanged telemetry chunks during a core repair", async () => {
    const calls: string[] = [];
    const manifestPath = `objects/${"b".repeat(64)}.json`;
    const locationPath = `objects/${"a".repeat(64)}.json`;
    const corePath = `objects/${"c".repeat(64)}.json`;
    const archive = {
      files: new Map([
        [manifestPath, "manifest"],
        [locationPath, "location"],
        [corePath, "core"],
        ["catalog.json", "catalog"],
      ]),
      catalog: { sessions: [{ manifest: { url: manifestPath } }] },
    } as BuiltArchive;
    const reuse = { locations: [{ url: locationPath }], car: undefined } as ArchiveManifest;
    await publishArchiveObjects(archive, async (path) => void calls.push(path), reuse);
    expect(calls).toEqual([corePath, manifestPath]);
  });

  it("gets the official round from the exact calendar date", () => {
    expect(
      officialRound(session(1).meeting, [
        { date: "2025-01-01", round: "7" },
        { date: "2025-01-02", round: "8" },
      ]),
    ).toBe(8);
    expect(
      officialRound(
        { ...session(1).meeting, meeting_name: "Las Vegas Grand Prix", date_end: "2024-11-24T07:59:59Z" },
        [{ date: "2024-11-23", raceName: "Las Vegas Grand Prix", round: "22" }],
      ),
    ).toBe(22);
  });

  it("parses import-only dry runs without credentials", () => {
    const args = parsePublisherArgs([
      "--dry-run",
      "--import-only",
      "--import-dir",
      "/tmp/import",
      "--years",
      "2025,2026",
    ]);
    expect(args).toMatchObject({
      dryRun: true,
      importOnly: true,
      maxSessions: 2,
      repairInvalidCores: false,
      years: [2025, 2026],
    });
    expect(parsePublisherArgs(["--repair-invalid-cores"]).repairInvalidCores).toBe(true);
    expect(parsePublisherArgs(["--max-sessions", "3"]).maxSessions).toBe(3);
    const allYears = parsePublisherArgs(["--all-years"]).years;
    expect(allYears[0]).toBe(2023);
    expect(allYears.at(-1)).toBe(new Date().getUTCFullYear());
    expect(() => parsePublisherArgs(["--all-years", "--years", "2025"])).toThrow(
      "--all-years cannot be combined with --years",
    );
    expect(() => parsePublisherArgs(["--max-sessions", "0"])).toThrow(
      "--max-sessions must be an integer from 1 to 10",
    );
  });

  it("authenticates against R2 before discovery and only permits deliberate bootstrap", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; method: string | undefined }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), method: init?.method });
      return new Response(null, { status: 404 });
    };
    const bucket = {
      file: (path: string) => ({
        presign: ({ method }: { method: string }) => `https://signed.invalid/${path}?method=${method}`,
      }),
    };
    try {
      await expect(preflightR2(bucket as never, false)).rejects.toThrow(
        "R2 catalog preflight failed: 404",
      );
      await expect(preflightR2(bucket as never, true)).resolves.toBeUndefined();
      expect(requests).toEqual([
        { url: "https://signed.invalid/catalog.json?method=HEAD", method: "HEAD" },
        { url: "https://signed.invalid/catalog.json?method=HEAD", method: "HEAD" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails closed when the canonical catalog is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("offline", { status: 503 });
    try {
      await expect(
        loadExistingCatalog(
          parsePublisherArgs(["--snapshot", "/tmp/stale-archive-catalog.json"]),
        ),
      ).rejects.toThrow("Catalog request failed: 503");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("accepts only a direct or explicitly wrapped legacy replay schema", () => {
    const catalogSession = session(1);
    const replay = {
      meeting: catalogSession.meeting,
      session: catalogSession.session,
      drivers: [{}],
      telemetryByDriver: { 1: { locations: [{}], laps: [{}] } },
      sessionStartMs: Date.parse(catalogSession.session.date_start),
      sessionEndMs: Date.parse(catalogSession.session.date_end),
      teamRadios: [],
      overtakes: [],
      weather: [],
      raceControl: [],
      pits: [],
    };
    expect(decodeLegacyReplay(replay, 1)).toBe(replay);
    expect(decodeLegacyReplay({ payload: replay }, 1)).toBe(replay);
    expect(() => decodeLegacyReplay({ hello: "world" }, 12345)).toThrow("replay payload");
    expect(() =>
      decodeLegacyReplay(
        { ...replay, session: { ...replay.session, session_name: "Sprint Qualifying" } },
        1,
      ),
    ).toThrow("unsupported session name Sprint Qualifying");
    expect(() =>
      decodeLegacyReplay({ ...replay, drivers: [], telemetryByDriver: {} }, 1),
    ).toThrow("invalid schema");
  });

  it("repairs sprint labels and drops sprint qualifying from an existing catalog", () => {
    const sprint = {
      ...session(2),
      round: 2,
      type: "Race",
      session: { ...session(2).session, session_name: "Sprint", session_type: "Race" },
    };
    const race = { ...session(3), round: 2 };
    const sprintQualifying = {
      ...session(4),
      round: 2,
      type: "Qualifying",
      session: {
        ...session(4).session,
        session_name: "Sprint Qualifying",
        session_type: "Qualifying",
      },
    };
    const catalog = normalizeExistingCatalog({
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      updatedAt: "old",
      sessions: [sprintQualifying, sprint, race],
    });
    expect(catalog.sessions.map(({ sessionKey, type }) => [sessionKey, type])).toEqual([
      [2, "Sprint"],
      [3, "Race"],
    ]);
  });

  it("rejects empty or mismatched legacy car telemetry", () => {
    const car = {
      sessionKey: 1,
      sampleIntervalMs: 500,
      createdAt: "2025-01-02T14:00:00Z",
      byDriver: {
        1: [{ timestampMs: 1, speed: 1, gear: 1, rpm: 1, throttle: 1, brake: 0, drs: 0 }],
      },
    };
    expect(decodeLegacyCar(car, 1)).toBe(car);
    expect(() => decodeLegacyCar({ ...car, sessionKey: 2 }, 1)).toThrow("invalid schema");
    expect(() => decodeLegacyCar({ ...car, byDriver: {} }, 1)).toThrow("no samples");
  });
});
