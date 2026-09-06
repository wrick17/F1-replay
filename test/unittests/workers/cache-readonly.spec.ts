import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import telemetryWorker from "../../../workers/openf1-car-telemetry/src/index";
import replayWorker from "../../../workers/openf1-proxy/src/index";

type Counts = { db: number; get: number; head: number };

let cache: FakeCache;

class FakeCache {
  private readonly responses = new Map<string, Response>();

  match(request: Request) {
    return Promise.resolve(this.responses.get(request.url)?.clone());
  }

  put(request: Request, response: Response) {
    this.responses.set(request.url, response.clone());
    return Promise.resolve();
  }

  keys() {
    return [...this.responses.keys()];
  }
}

const createDb = (row: unknown, counts: Counts) => ({
  prepare: () => {
    counts.db += 1;
    return {
      bind: () => ({
        first: () => Promise.resolve(row),
      }),
    };
  },
});

const createBucket = (object: unknown, counts: Counts) => ({
  get: () => {
    counts.get += 1;
    return Promise.resolve(object);
  },
  head: () => {
    counts.head += 1;
    return Promise.resolve(object);
  },
});

const createR2Object = (body = new Uint8Array([31, 139, 8, 0])) => ({
  body,
  httpEtag: '"gzip-etag"',
  writeHttpMetadata: (headers: Headers) => {
    headers.set("Content-Type", "application/json");
    headers.set("Content-Encoding", "gzip");
  },
});

const invoke = (
  worker: typeof replayWorker | typeof telemetryWorker,
  request: Request,
  env: object,
  waitUntil: (promise: Promise<unknown>) => void = () => undefined,
) =>
  (
    worker.fetch as unknown as (
      request: Request,
      env: object,
      ctx: { waitUntil: (promise: Promise<unknown>) => void },
    ) => Promise<Response>
  )(request, env, { waitUntil });

describe("legacy cache workers are read-only", () => {
  beforeEach(() => {
    cache = new FakeCache();
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { default: cache },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "caches");
  });

  it("returns token-free misses and rejects non-positive session keys", async () => {
    for (const [worker, path, bucketName] of [
      [replayWorker, "/replay", "REPLAY_BUCKET"],
      [telemetryWorker, "/car-telemetry", "CAR_TELEMETRY_BUCKET"],
    ] as const) {
      const counts: Counts = { db: 0, get: 0, head: 0 };
      const env = {
        DB: createDb(null, counts),
        [bucketName]: createBucket(null, counts),
      };
      const miss = await invoke(
        worker,
        new Request(`https://cache.test${path}?session_key=999999999`),
        env,
      );

      expect(miss.status).toBe(202);
      expect(await miss.json()).toEqual({ status: "miss" });

      await cache.put(
        new Request(`https://cache.test${path}?session_key=0`),
        new Response("stale invalid cache entry", { status: 200 }),
      );

      for (const invalid of ["0", "-1", "1.5", "01", "abc", "9007199254740992"]) {
        const response = await invoke(
          worker,
          new Request(`https://cache.test${path}?session_key=${invalid}`),
          env,
        );
        expect(response.status).toBe(400);
      }
      expect(counts.db).toBe(1);
    }
  });

  it("rejects current and legacy POST forms before touching storage", async () => {
    const counts: Counts = { db: 0, get: 0, head: 0 };
    const forbiddenStorage = createBucket(null, counts);
    const cases = [
      [
        replayWorker,
        new Request("https://cache.test/replay?session_key=123", {
          method: "POST",
          body: '{"poison":true}',
        }),
        { DB: createDb(null, counts), REPLAY_BUCKET: forbiddenStorage },
      ],
      [
        replayWorker,
        new Request("https://cache.test/replay", {
          method: "POST",
          body: '{"session_key":123,"payload":{"poison":true}}',
        }),
        { DB: createDb(null, counts), REPLAY_BUCKET: forbiddenStorage },
      ],
      [
        telemetryWorker,
        new Request("https://cache.test/car-telemetry?session_key=123", {
          method: "POST",
          body: '{"poison":true}',
        }),
        { DB: createDb(null, counts), CAR_TELEMETRY_BUCKET: forbiddenStorage },
      ],
    ] as const;

    for (const [worker, request, env] of cases) {
      const response = await invoke(worker, request, env);
      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: "Method not allowed" });
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET,HEAD,OPTIONS",
      );
      expect(response.headers.has("Access-Control-Allow-Headers")).toBe(false);
    }

    expect(counts).toEqual({ db: 0, get: 0, head: 0 });
  });

  it("preserves cached GETs, gzip metadata, ETags, and edge caching", async () => {
    for (const [worker, path, row, bucketName] of [
      [
        replayWorker,
        "/replay",
        { session_key: 123, payload: "", r2_key: "replay/123.json" },
        "REPLAY_BUCKET",
      ],
      [
        telemetryWorker,
        "/car-telemetry",
        { session_key: 123, r2_key: "car-telemetry/123.json" },
        "CAR_TELEMETRY_BUCKET",
      ],
    ] as const) {
      const counts: Counts = { db: 0, get: 0, head: 0 };
      const env = {
        DB: createDb(row, counts),
        [bucketName]: createBucket(createR2Object(), counts),
      };
      const waits: Promise<unknown>[] = [];
      const url = `https://cache.test${path}?session_key=123`;
      const response = await invoke(worker, new Request(url), env, (promise) => {
        waits.push(promise);
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Encoding")).toBe("gzip");
      expect(response.headers.get("ETag")).toBe('"gzip-etag"');
      expect(response.headers.get("X-Cache")).toBe("HIT");
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([31, 139, 8, 0]);
      await Promise.all(waits);

      const edgeResponse = await invoke(worker, new Request(url), env);
      expect(edgeResponse.status).toBe(200);
      expect(edgeResponse.headers.get("Content-Encoding")).toBe("gzip");
      expect(edgeResponse.headers.get("ETag")).toBe('"gzip-etag"');
      expect(edgeResponse.headers.get("X-Cache")).toBe("EDGE");
      expect(cache.keys()).toContain(`${url}&__cache_version=3`);
      expect(cache.keys()).not.toContain(url);
      expect(counts).toEqual({ db: 1, get: 1, head: 0 });
    }
  });

  it("marks compressed R2 and cached response bodies for manual encoding", async () => {
    const NativeResponse = globalThis.Response;
    const recorded: Array<{
      contentEncoding: string | null;
      encodeBody: string | undefined;
      hasBody: boolean;
    }> = [];

    class RecordingResponse extends NativeResponse {
      constructor(
        body?: BodyInit | null,
        init?: ResponseInit & { encodeBody?: "manual" },
      ) {
        const { encodeBody, ...nativeInit } = init ?? {};
        recorded.push({
          contentEncoding: new Headers(init?.headers).get("Content-Encoding"),
          encodeBody,
          hasBody: body !== null && body !== undefined,
        });
        super(body, nativeInit);
      }
    }

    Object.defineProperty(globalThis, "Response", {
      configurable: true,
      value: RecordingResponse,
    });

    try {
      for (const [worker, path, row, bucketName] of [
        [
          replayWorker,
          "/replay",
          { session_key: 123, payload: "", r2_key: "replay/123.json" },
          "REPLAY_BUCKET",
        ],
        [
          telemetryWorker,
          "/car-telemetry",
          { session_key: 123, r2_key: "car-telemetry/123.json" },
          "CAR_TELEMETRY_BUCKET",
        ],
      ] as const) {
        const counts: Counts = { db: 0, get: 0, head: 0 };
        const env = {
          DB: createDb(row, counts),
          [bucketName]: createBucket(createR2Object(), counts),
        };
        const waits: Promise<unknown>[] = [];
        const url = `https://manual.test${path}?session_key=123`;
        await invoke(worker, new Request(url), env, (promise) => waits.push(promise));
        await Promise.all(waits);
        await invoke(worker, new Request(url), env);
      }

      const missCounts: Counts = { db: 0, get: 0, head: 0 };
      await invoke(
        replayWorker,
        new Request("https://manual.test/replay?session_key=999999999"),
        {
          DB: createDb(null, missCounts),
          REPLAY_BUCKET: createBucket(null, missCounts),
        },
      );
    } finally {
      Object.defineProperty(globalThis, "Response", {
        configurable: true,
        value: NativeResponse,
      });
    }

    const compressedBodies = recorded.filter(
      (entry) => entry.hasBody && entry.contentEncoding === "gzip",
    );
    expect(compressedBodies).toHaveLength(6);
    expect(compressedBodies.every((entry) => entry.encodeBody === "manual")).toBe(true);
    const plainBodies = recorded.filter(
      (entry) => entry.hasBody && entry.contentEncoding === null,
    );
    expect(plainBodies.length).toBeGreaterThan(0);
    expect(plainBodies.every((entry) => entry.encodeBody === undefined)).toBe(true);
  });

  it("uses R2 HEAD for status probes and HTTP HEAD", async () => {
    for (const [worker, path, row, bucketName] of [
      [
        replayWorker,
        "/replay",
        { session_key: 123, payload: "", r2_key: "replay/123.json" },
        "REPLAY_BUCKET",
      ],
      [
        telemetryWorker,
        "/car-telemetry",
        { session_key: 123, r2_key: "car-telemetry/123.json" },
        "CAR_TELEMETRY_BUCKET",
      ],
    ] as const) {
      const counts: Counts = { db: 0, get: 0, head: 0 };
      const env = {
        DB: createDb(row, counts),
        [bucketName]: createBucket(createR2Object(), counts),
      };
      const status = await invoke(
        worker,
        new Request(`https://cache.test${path}?session_key=123&status=1`),
        env,
      );
      expect(status.status).toBe(200);
      expect(await status.json()).toEqual({ status: "hit" });

      const head = await invoke(
        worker,
        new Request(`https://cache.test${path}?session_key=123`, { method: "HEAD" }),
        env,
      );
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      expect(head.headers.get("Content-Encoding")).toBe("gzip");
      expect(head.headers.get("ETag")).toBe('"gzip-etag"');
      expect(counts).toEqual({ db: 2, get: 0, head: 2 });
    }
  });
});
