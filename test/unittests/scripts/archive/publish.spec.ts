import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activateCatalog,
  createOpenF1,
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
  r2Upload,
} from "../../../../scripts/archive/publish";
import {
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveCatalog,
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

const objectPath = (content: string) =>
  `objects/${new Bun.CryptoHasher("sha256").update(content).digest("hex")}.json`;

const signedUrl = "https://signed.invalid/object.json?X-Amz-Signature=private";
const leakingError = () => Object.assign(new Error(`Connection failed: ${signedUrl}`), { path: signedUrl });

// R2 behind presigned URLs plus the public custom domain, which can answer differently.
const fakeArchiveStorage = (publicOverride: (path: string) => Response | undefined = () => undefined) => {
  const stored = new Map<string, { body: Uint8Array<ArrayBuffer>; headers: Record<string, string> }>();
  const requests: Array<{ path: string; method: string; signed: boolean }> = [];
  const store = (path: string, content: string, headers: Record<string, string> = {}) =>
    stored.set(path, {
      body: Bun.gzipSync(content),
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "cache-control": path === "catalog.json" ? "public,max-age=300" : "public,max-age=31536000,immutable",
        ...headers,
      },
    });
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.slice(1);
    const method = init?.method ?? "GET";
    const signed = url.origin === "https://signed.invalid";
    requests.push({ path, method, signed });
    if (!signed) {
      expect(url.origin).toBe("https://data.f1.wrick17.com");
      const response = publicOverride(path);
      if (response) return response;
    }
    if (method === "PUT") {
      stored.set(path, {
        body: init?.body as Uint8Array<ArrayBuffer>,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(null);
    }
    const object = stored.get(path);
    if (!object) return new Response(null, { status: 404 });
    if (method === "HEAD") return new Response(null, { headers: object.headers });
    // Bun's fetch decodes gzip from the public domain; presigned readback is decoded by the publisher.
    return new Response(signed ? object.body : Bun.gunzipSync(object.body), { headers: object.headers });
  };
  return {
    bucket: {
      file: (path: string) => ({
        presign: ({ method }: { method: string }) =>
          `https://signed.invalid/${path}?method=${method}&X-Amz-Signature=private`,
      }),
    } as never,
    fetch: fetch as typeof globalThis.fetch,
    read: (path: string) => new TextDecoder().decode(Bun.gunzipSync(stored.get(path)?.body ?? new Uint8Array())),
    requests,
    store,
    stored,
  };
};

const sessionArchive = (manifest: string, objects: string[]) =>
  ({
    files: new Map([
      [objectPath(manifest), manifest],
      ...objects.map((content) => [objectPath(content), content] as const),
      ["catalog.json", "{}"],
    ]),
    catalog: { sessions: [{ manifest: { url: objectPath(manifest) } }] },
  }) as BuiltArchive;

describe("archive publisher", () => {
  it.each([
    [false, "nothing"],
    [false, "chunk"],
    [false, "manifest"],
    [true, "nothing"],
    [true, "chunk"],
    [true, "manifest"],
  ])("requires public readback of each object, already stored=%p, public 403 for %s", async (alreadyStored, denied) => {
    const originalFetch = globalThis.fetch;
    const chunks = ['{"chunk":1}', '{"chunk":2}'];
    const manifest = '{"manifest":1}';
    const paths = [...chunks, manifest].map(objectPath);
    const deniedPath = denied === "chunk" ? paths[1] : denied === "manifest" ? paths[2] : undefined;
    const storage = fakeArchiveStorage((path) =>
      path === deniedPath
        ? new Response("<html>blocked</html>", {
            status: 403,
            headers: { "cf-ray": "test-ray", "content-type": "text/html", "set-cookie": "session=secret" },
          })
        : undefined,
    );
    if (alreadyStored) for (const content of [...chunks, manifest]) storage.store(objectPath(content), content);
    globalThis.fetch = storage.fetch;
    try {
      const result = publishArchiveObjects(sessionArchive(manifest, chunks), r2Upload(storage.bucket));
      if (!deniedPath) {
        await result;
        // An earlier object's public success never stands in for a later one.
        expect(storage.requests.filter(({ signed }) => !signed).map(({ path }) => path).sort()).toEqual(
          [...paths].sort(),
        );
        return;
      }
      const error = await result.then(() => undefined, (caught: Error) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe(`Public object unavailable: ${deniedPath} (403; cf-ray=test-ray; content-type=text/html)`);
      // Authenticated storage readback succeeded, which must not count as publication.
      expect(storage.requests).toContainEqual({ path: deniedPath, method: "GET", signed: true });
      if (denied === "chunk") expect(storage.requests.some(({ path }) => path === paths[2])).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each(["bytes", "metadata"])("stops before the manifest when a stored object has corrupt %s", async (corruption) => {
    const originalFetch = globalThis.fetch;
    const chunk = '{"chunk":1}';
    const manifest = '{"manifest":1}';
    const storage = fakeArchiveStorage();
    storage.store(
      objectPath(chunk),
      corruption === "bytes" ? '{"chunk":0}' : chunk,
      corruption === "metadata" ? { "content-type": "text/plain" } : {},
    );
    globalThis.fetch = storage.fetch;
    try {
      await expect(
        publishArchiveObjects(sessionArchive(manifest, [chunk]), r2Upload(storage.bucket)),
      ).rejects.toThrow(
        corruption === "bytes"
          ? `R2 verification failed: ${objectPath(chunk)}`
          : `Public object is missing JSON Content-Type: ${objectPath(chunk)}`,
      );
      expect(storage.stored.has(objectPath(manifest))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each(["verified", "unchanged", "denied", "stale"])(
    "activates the catalog and snapshot only after public catalog readback, public=%s",
    async (state) => {
      const originalFetch = globalThis.fetch;
      const previous: ArchiveCatalog = {
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        updatedAt: "2026-10-24T00:00:00Z",
        sessions: [session(1)],
      };
      const catalog =
        state === "unchanged"
          ? previous
          : mergeCatalog(previous, [{ ...session(2), round: 23 }], "2026-10-25T00:00:00Z");
      const storage = fakeArchiveStorage((path) => {
        if (path !== "catalog.json" || state === "verified") return undefined;
        if (state === "denied") return new Response("Forbidden", { status: 403 });
        return new Response(JSON.stringify(previous), {
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "cache-control": "public,max-age=300",
          },
        });
      });
      storage.store("catalog.json", JSON.stringify(previous));
      const directory = await mkdtemp(join(tmpdir(), "archive-snapshot-"));
      const snapshot = join(directory, "catalog.json");
      globalThis.fetch = storage.fetch;
      try {
        const result = activateCatalog(
          catalog,
          previous,
          r2Upload(storage.bucket),
          parsePublisherArgs(["--snapshot", snapshot]),
        );
        if (state === "verified" || state === "unchanged") {
          await result;
          expect(storage.read("catalog.json")).toBe(JSON.stringify(catalog));
          expect(await Bun.file(snapshot).json()).toEqual(catalog);
          if (state === "unchanged") expect(storage.requests).toEqual([]);
          return;
        }
        const error = await result.then(() => undefined, (caught: Error) => caught);
        expect(storage.read("catalog.json")).toBe(JSON.stringify(previous));
        expect(await Bun.file(snapshot).exists()).toBe(false);
        expect(error?.message).toBe(
          state === "denied" ? "Public object unavailable: catalog.json (403)" : "Public object mismatch: catalog.json",
        );
      } finally {
        globalThis.fetch = originalFetch;
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ["HEAD", "request"],
    ["PUT", "request"],
    ["GET", "request"],
    ["GET", "body"],
  ])("redacts signed URLs when an R2 %s %s fails", async (method, stage) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const requestMethod = init?.method ?? "GET";
      if (requestMethod === method && stage === "request") throw leakingError();
      if (requestMethod === method) {
        return new Response(new ReadableStream({ pull: (controller) => controller.error(leakingError()) }));
      }
      return new Response(null, { status: requestMethod === "HEAD" ? 404 : 200 });
    }) as typeof fetch;
    const bucket = { file: () => ({ presign: () => signedUrl }) } as never;
    try {
      const error = (await r2Upload(bucket)("object.json", "{}", true).catch((caught) => caught)) as Error;
      expect(error.message).toBe(`R2 ${method} object.json failed: network error`);
      expect(Bun.inspect(error)).not.toContain("X-Amz-Signature");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each(["healthy", "failed"])(
    "preserves the committed snapshot when a publisher run fails without additions, run=%s",
    async (run) => {
      const directory = await mkdtemp(join(tmpdir(), "archive-main-"));
      const catalogPath = join(directory, "canonical.json");
      const importDir = join(directory, "import");
      const snapshot = join(directory, "snapshot.json");
      const canonical = {
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        updatedAt: "2026-10-25T00:00:00Z",
        sessions: [session(2)],
      };
      try {
        await Bun.write(catalogPath, JSON.stringify(canonical));
        await Bun.write(snapshot, "older snapshot\n");
        await mkdir(join(importDir, "replay"), { recursive: true });
        // A dangling replay link fails the import before any network request.
        if (run === "failed") await symlink(join(directory, "missing.json"), join(importDir, "replay/9.json"));
        const child = Bun.spawn(
          [
            process.execPath,
            join(import.meta.dir, "../../../../scripts/archive/publish.ts"),
            "--dry-run",
            "--import-only",
            "--catalog",
            catalogPath,
            "--import-dir",
            importDir,
            "--quarantine",
            join(directory, "quarantine.json"),
            "--snapshot",
            snapshot,
          ],
          { stdout: "ignore", stderr: "ignore" },
        );
        const exitCode = await child.exited;
        if (run === "healthy") {
          expect(exitCode).toBe(0);
          expect(await Bun.file(snapshot).json()).toEqual(normalizeExistingCatalog(canonical));
        } else {
          expect(exitCode).not.toBe(0);
          expect(await Bun.file(snapshot).text()).toBe("older snapshot\n");
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("treats OpenF1 collection no-results responses as empty without masking other 404s", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        return Response.json(
          { detail: path === "/v1/bad" ? "Not Found" : "No results found." },
          { status: 404 },
        );
      },
    });
    const openf1 = createOpenF1(`${server.url}v1`, 0);
    try {
      expect(await openf1.fetchOpenF1("position", { session_key: 11361 })).toEqual([]);
      expect(await openf1.fetchOpenF1("overtakes", { session_key: 11357 })).toEqual([]);
      await expect(openf1.fetchOpenF1("bad", {})).rejects.toThrow("Request failed 404");
    } finally {
      server.stop(true);
    }
  });

  it("replaces a stable route without dropping other catalog sessions", () => {
    const existing: ArchiveCatalog = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      updatedAt: "old",
      sessions: [session(1), { ...session(2), round: 23 }],
    };
    const merged = mergeCatalog(existing, [session(3)], "new");
    expect(merged.sessions.map((item) => item.sessionKey)).toEqual([2, 3]);
    expect(merged.updatedAt).toBe("new");
    expect(mergeCatalog(existing, [], "unused")).toBe(existing);
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

  it.each(["verified", "denied"])(
    "reuses stored telemetry chunks during a core repair only after public readback, public=%s",
    async (state) => {
      const originalFetch = globalThis.fetch;
      const manifest = '{"manifest":1}';
      const reusedChunks = ['{"location":1}', '{"car":1}'];
      const reusedPaths = reusedChunks.map(objectPath);
      const storage = fakeArchiveStorage((path) =>
        state === "denied" && path === reusedPaths[0] ? new Response("Forbidden", { status: 403 }) : undefined,
      );
      for (const content of reusedChunks) storage.store(objectPath(content), content);
      globalThis.fetch = storage.fetch;
      try {
        const result = publishArchiveObjects(
          sessionArchive(manifest, ['{"core":1}', ...reusedChunks]),
          r2Upload(storage.bucket),
        );
        if (state === "verified") {
          await result;
          for (const path of reusedPaths) expect(storage.requests).toContainEqual({ path, method: "GET", signed: false });
        } else {
          await expect(result).rejects.toThrow(`Public object unavailable: ${reusedPaths[0]} (403)`);
          // The repaired session is never promoted over a chunk playback cannot read.
          expect(storage.stored.has(objectPath(manifest))).toBe(false);
        }
        // R2 HEAD finds the reused chunks, so the repair never rewrites them.
        expect(storage.requests.filter(({ path, method }) => method === "PUT" && reusedPaths.includes(path))).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

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
    expect(parsePublisherArgs(["--max-sessions", "100"]).maxSessions).toBe(100);
    expect(() => parsePublisherArgs(["--max-sessions", "0"])).toThrow(
      "--max-sessions must be an integer from 1 to 100",
    );
    expect(() => parsePublisherArgs(["--max-sessions", "101"])).toThrow(
      "--max-sessions must be an integer from 1 to 100",
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
      globalThis.fetch = (async (_input: string | URL | Request): Promise<Response> => {
        throw leakingError();
      }) as typeof fetch;
      const error = (await preflightR2(bucket as never, false).catch((caught) => caught)) as Error;
      expect(error.message).toBe("R2 catalog preflight failed: network error");
      expect(Bun.inspect(error)).not.toContain("X-Amz-Signature");
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

  it.each([false, true])("reads the canonical R2 catalog when public access is blocked, gzip=%s", async (gzip) => {
    const originalFetch = globalThis.fetch;
    const catalog: ArchiveCatalog = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      updatedAt: "2026-10-14T08:00:00Z",
      sessions: [session(1), { ...session(2), round: 23 }],
    };
    const requests: string[] = [];
    const bucket = {
      file: (path: string) => ({
        presign: ({ method }: { method: string }) => `https://signed.invalid/${path}?method=${method}`,
      }),
    };
    globalThis.fetch = async (input) => {
      requests.push(String(input));
      if (!String(input).startsWith("https://signed.invalid/")) {
        return new Response("Forbidden", { status: 403 });
      }
      const content = JSON.stringify(catalog);
      return new Response(gzip ? Bun.gzipSync(content) : content);
    };
    try {
      expect(await loadExistingCatalog(parsePublisherArgs([]), bucket as never)).toEqual(catalog);
      expect(requests).toEqual(["https://signed.invalid/catalog.json?method=GET"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails closed when the authenticated catalog is unavailable or invalid", async () => {
    const originalFetch = globalThis.fetch;
    const bucket = {
      file: () => ({ presign: () => "https://signed.invalid/catalog.json" }),
    };
    try {
      globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
      await expect(
        loadExistingCatalog(parsePublisherArgs([]), bucket as never),
      ).rejects.toThrow("Catalog request failed: 403");
      globalThis.fetch = async () => Response.json({ sessions: [] });
      await expect(
        loadExistingCatalog(parsePublisherArgs([]), bucket as never),
      ).rejects.toThrow();
      globalThis.fetch = async () => {
        throw Object.assign(new Error("Connection failed"), {
          path: "https://signed.invalid/catalog.json?X-Amz-Signature=private",
        });
      };
      let networkError: unknown;
      try {
        await loadExistingCatalog(parsePublisherArgs([]), bucket as never);
      } catch (error) {
        networkError = error;
      }
      expect(networkError).toBeInstanceOf(Error);
      expect((networkError as Error).message).toBe("Catalog request failed: network error");
      expect(Bun.inspect(networkError)).not.toContain("X-Amz-Signature");
      globalThis.fetch = (async (_input: string | URL | Request) =>
        new Response(new ReadableStream({ pull: (controller) => controller.error(leakingError()) }))) as typeof fetch;
      const bodyError = (await loadExistingCatalog(parsePublisherArgs([]), bucket as never).catch(
        (caught) => caught,
      )) as Error;
      expect(bodyError.message).toBe("Catalog request failed: network error");
      expect(Bun.inspect(bodyError)).not.toContain("X-Amz-Signature");
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
