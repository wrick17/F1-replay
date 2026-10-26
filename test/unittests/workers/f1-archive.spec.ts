import { describe, expect, it } from "bun:test";
import { checkArchiveResponse } from "../../../scripts/archive/probe-endpoint";
import archiveWorker from "../../../workers/f1-archive/src/index";

const objectContent = '{"core":1}';
const objectKey = `objects/${new Bun.CryptoHasher("sha256").update(objectContent).digest("hex")}.json`;

// Stored like the publisher writes them: gzip bytes plus HTTP metadata.
const createBucket = (keys: Record<string, string>, fail = false) => {
  const reads: string[] = [];
  const object = (key: string, withBody: boolean) => {
    reads.push(`${withBody ? "get" : "head"}:${key}`);
    if (fail) return Promise.reject(new Error("R2 internal error"));
    if (!(key in keys)) return Promise.resolve(null);
    const body = Bun.gzipSync(keys[key]);
    return Promise.resolve({
      ...(withBody ? { body: new Blob([body]).stream() } : {}),
      size: body.byteLength,
      httpEtag: `"etag-${key}"`,
      writeHttpMetadata: (headers: Headers) => {
        headers.set("Content-Type", "application/json");
        headers.set("Content-Encoding", "gzip");
        headers.set(
          "Cache-Control",
          key === "catalog.json" ? "public,max-age=300" : "public,max-age=31536000,immutable",
        );
      },
    });
  };
  return {
    env: {
      ARCHIVE_BUCKET: {
        get: (key: string) => object(key, true),
        head: (key: string) => object(key, false),
      },
    },
    reads,
  };
};

const invoke = (request: Request, env: object) =>
  (archiveWorker.fetch as unknown as (request: Request, env: object) => Promise<Response>)(
    request,
    env,
  );

const expectCors = (response: Response) => {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
    "ETag, Content-Length, Cache-Control",
  );
};

describe("f1-archive worker", () => {
  it("streams stored gzip bytes with their metadata, ETag, and CORS", async () => {
    const catalog = '{"schemaVersion":2,"sessions":[]}';
    const { env, reads } = createBucket({ "catalog.json": catalog, [objectKey]: objectContent });
    for (const [key, cacheControl] of [
      ["catalog.json", "public,max-age=300"],
      [objectKey, "public,max-age=31536000,immutable"],
    ]) {
      const response = await invoke(new Request(`https://archive.test/${key}?verify=1`), env);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Encoding")).toBe("gzip");
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Cache-Control")).toBe(cacheControl);
      expect(response.headers.get("ETag")).toBe(`"etag-${key}"`);
      expectCors(response);
      const raw = new Uint8Array(await response.arrayBuffer());
      // The body is the stored gzip stream, not a decoded or recompressed copy.
      expect(raw.slice(0, 2)).toEqual(new Uint8Array([0x1f, 0x8b]));
      expect(new TextDecoder().decode(Bun.gunzipSync(raw))).toBe(
        key === "catalog.json" ? catalog : objectContent,
      );
    }

    const head = await invoke(new Request("https://archive.test/catalog.json", { method: "HEAD" }), env);
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("Content-Encoding")).toBe("gzip");
    expect(head.headers.get("ETag")).toBe('"etag-catalog.json"');
    expect(reads).toEqual(["get:catalog.json", `get:${objectKey}`, "head:catalog.json"]);
  });

  it("rejects other paths and methods without reading the bucket", async () => {
    const { env, reads } = createBucket({ "catalog.json": "{}", "private.json": "{}" });
    for (const path of [
      "/",
      "/private.json",
      "/objects/abc.json",
      `/objects/${"A".repeat(64)}.json`,
      `/objects/${"a".repeat(64)}.json/`,
      `/objects/../${"a".repeat(64)}.json`,
      "/catalog.json.bak",
    ]) {
      const response = await invoke(new Request(`https://archive.test${path}`), env);
      expect(response.status).toBe(404);
      expectCors(response);
    }
    for (const method of ["PUT", "POST", "DELETE", "PATCH"]) {
      const response = await invoke(
        new Request("https://archive.test/catalog.json", { method, body: "{}" }),
        env,
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    }
    const preflight = await invoke(
      new Request("https://archive.test/catalog.json", { method: "OPTIONS" }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET,HEAD");
    expectCors(preflight);
    expect(reads).toEqual([]);
  });

  it("reports missing objects and storage failures without caching them", async () => {
    const missing = await invoke(new Request(`https://archive.test/${objectKey}`), createBucket({}).env);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("no-store");

    const { env } = createBucket({ "catalog.json": "{}" }, true);
    const failed = await invoke(new Request("https://archive.test/catalog.json"), env);
    expect(failed.status).toBe(503);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
    expect(await failed.text()).toBe("Archive storage unavailable");
    expectCors(failed);
  });

  it("passes the runner probe, which rejects a Bot Fight challenge", async () => {
    const catalog = JSON.stringify({ schemaVersion: 2, updatedAt: "2026-10-26T00:00:00Z", sessions: [] });
    const { env } = createBucket({ "catalog.json": catalog, [objectKey]: objectContent });
    for (const key of ["catalog.json", objectKey]) {
      const response = await invoke(new Request(`https://archive.test/${key}`), env);
      expect((await checkArchiveResponse(key, response)).problems).toEqual([]);
    }
    const challenge = new Response("<html>challenge</html>", {
      status: 403,
      headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
    });
    expect((await checkArchiveResponse(objectKey, challenge)).problems).toContain(
      "cf-mitigated=challenge",
    );
  });
});
