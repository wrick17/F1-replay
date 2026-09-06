type CarTelemetryCacheRow = {
  session_key: number;
  r2_key?: string | null;
  payload_size?: number | null;
  created_at: string;
};

type Env = {
  DB: D1Database;
  CAR_TELEMETRY_BUCKET: R2Bucket;
};

const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";
const EDGE_CACHE_VERSION = "3";

type WorkerResponseInit = ResponseInit & { encodeBody?: "manual" };

const parseSessionKey = (value: string | null) => {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const sessionKey = Number(value);
  return Number.isSafeInteger(sessionKey) ? sessionKey : null;
};

const edgeCacheKey = (requestUrl: string) => {
  const url = new URL(requestUrl);
  url.searchParams.set("__cache_version", EDGE_CACHE_VERSION);
  return new Request(url.toString(), { method: "GET" });
};

const responseInit = (status: number, headers: Headers): WorkerResponseInit => ({
  status,
  headers,
  ...(headers.has("Content-Encoding") ? { encodeBody: "manual" as const } : {}),
});

const withCors = (headers: Headers) => {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  headers.set("Access-Control-Expose-Headers", "Content-Encoding, ETag, X-Cache");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
};

const jsonResponse = (body: unknown, status = 200, options?: { cacheControl?: string }) => {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
  });
  if (options?.cacheControl) {
    headers.set("Cache-Control", options.cacheControl);
  }
  return new Response(JSON.stringify(body), { status, headers });
};

const statusResponse = (status: "hit" | "miss", xCache: string, headOnly: boolean) =>
  new Response(headOnly ? null : JSON.stringify({ status }), {
    status: status === "hit" ? 200 : 202,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Cache": xCache,
    },
  });

const r2Headers = (object: R2Object) => {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  headers.set("Cache-Control", CACHE_CONTROL_IMMUTABLE);
  headers.set("ETag", object.httpEtag);
  headers.set("X-Cache", "HIT");
  return headers;
};

const handleReadCarTelemetry = async (request: Request, env: Env, headOnly: boolean) => {
  const url = new URL(request.url);
  const sessionKey = parseSessionKey(url.searchParams.get("session_key"));
  const statusOnly = url.searchParams.get("status") === "1";
  if (sessionKey === null) {
    return jsonResponse({ error: "session_key must be a positive integer" }, 400);
  }

  if (statusOnly) {
    const canonicalUrl = new URL(request.url);
    canonicalUrl.searchParams.delete("status");
    const edgeHit = await caches.default.match(edgeCacheKey(canonicalUrl.toString()));
    if (edgeHit?.status === 200) {
      return statusResponse("hit", "EDGE", headOnly);
    }
  }

  const cached = await env.DB.prepare(
    "SELECT session_key, r2_key, payload_size, created_at FROM car_telemetry_cache WHERE session_key = ?",
  )
    .bind(sessionKey)
    .first<CarTelemetryCacheRow>();

  if (cached?.r2_key) {
    if (statusOnly || headOnly) {
      const object = await env.CAR_TELEMETRY_BUCKET.head(cached.r2_key);
      if (object) {
        if (statusOnly) return statusResponse("hit", "HIT", headOnly);
        const headers = r2Headers(object);
        return new Response(null, responseInit(200, headers));
      }
    } else {
      const object = await env.CAR_TELEMETRY_BUCKET.get(cached.r2_key);
      if (object) {
        const headers = r2Headers(object);
        return new Response(object.body, responseInit(200, headers));
      }
    }
  }

  return statusResponse("miss", "MISS", headOnly);
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withCors(new Headers()) });
    }

    if (url.pathname !== "/car-telemetry") {
      const headers = withCors(new Headers());
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      const response = jsonResponse({ error: "Method not allowed" }, 405);
      return new Response(response.body, {
        status: response.status,
        headers: withCors(new Headers(response.headers)),
      });
    }

    if (parseSessionKey(url.searchParams.get("session_key")) === null) {
      const response = jsonResponse({ error: "session_key must be a positive integer" }, 400);
      return new Response(response.body, {
        status: response.status,
        headers: withCors(new Headers(response.headers)),
      });
    }

    try {
      const headOnly = request.method === "HEAD";
      const cacheKey = edgeCacheKey(request.url);
      const edgeHit = await caches.default.match(cacheKey);
      if (edgeHit) {
        if (!headOnly) return edgeHit;
        return new Response(
          null,
          responseInit(edgeHit.status, withCors(new Headers(edgeHit.headers))),
        );
      }

      const originResponse = await handleReadCarTelemetry(request, env, headOnly);
      const headers = withCors(new Headers(originResponse.headers));
      if (!headOnly && originResponse.status === 200) {
        const response = new Response(
          originResponse.body,
          responseInit(originResponse.status, headers),
        );
        const cacheHeaders = withCors(new Headers(headers));
        cacheHeaders.set("X-Cache", "EDGE");
        const cacheResponse = new Response(
          response.clone().body,
          responseInit(response.status, cacheHeaders),
        );
        ctx.waitUntil(caches.default.put(cacheKey, cacheResponse));
        return response;
      }
      return new Response(
        headOnly ? null : originResponse.body,
        responseInit(originResponse.status, headers),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      const headers = withCors(new Headers());
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify({ error: message }), { status: 500, headers });
    }
  },
};
