type CarTelemetryCacheRow = {
  session_key: number;
  r2_key?: string | null;
  payload_size?: number | null;
  created_at: string;
};

type TelemetryUploadBody = {
  session_key: number;
  payload: unknown;
};

type UploadTokenPayload = {
  session_key: number;
  exp: number;
};

type Env = {
  DB: D1Database;
  CAR_TELEMETRY_BUCKET: R2Bucket;
  CAR_TELEMETRY_UPLOAD_SECRET: string;
};

const TOKEN_TTL_SECONDS = 600;
const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";

const base64UrlEncode = (input: ArrayBuffer | Uint8Array) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(`${padded}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

let signingKeyPromise: Promise<CryptoKey> | null = null;

const getSigningKey = (secret: string) => {
  if (!signingKeyPromise) {
    const encoder = new TextEncoder();
    signingKeyPromise = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return signingKeyPromise;
};

const signTokenPayload = async (payload: UploadTokenPayload, secret: string) => {
  const encoder = new TextEncoder();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(encoder.encode(payloadJson));
  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const signatureB64 = base64UrlEncode(signature);
  return `${payloadB64}.${signatureB64}`;
};

const verifyToken = async (token: string, secret: string): Promise<UploadTokenPayload | null> => {
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) {
    return null;
  }
  const encoder = new TextEncoder();
  const key = await getSigningKey(secret);
  const expected = base64UrlEncode(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64)),
  );
  if (expected !== signatureB64) {
    return null;
  }
  const payloadBytes = base64UrlDecode(payloadB64);
  const payloadJson = new TextDecoder().decode(payloadBytes);
  const payload = JSON.parse(payloadJson) as UploadTokenPayload;
  if (typeof payload.session_key !== "number" || typeof payload.exp !== "number") {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return null;
  }
  return payload;
};

const withCors = (headers: Headers) => {
  // Public API: allow any origin, avoid cache fragmentation on Origin.
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Expose-Headers", "X-Cache");
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

const handleGetCarTelemetry = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const rawSessionKey = url.searchParams.get("session_key");
  if (!rawSessionKey) {
    return jsonResponse({ error: "session_key is required" }, 400);
  }
  const sessionKey = Number(rawSessionKey);
  if (!Number.isFinite(sessionKey)) {
    return jsonResponse({ error: "session_key must be a number" }, 400);
  }

  const cached = await env.DB.prepare(
    "SELECT session_key, r2_key, payload_size, created_at FROM car_telemetry_cache WHERE session_key = ?",
  )
    .bind(sessionKey)
    .first<CarTelemetryCacheRow>();

  if (cached?.r2_key) {
    const object = await env.CAR_TELEMETRY_BUCKET.get(cached.r2_key);
    if (object) {
      const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": CACHE_CONTROL_IMMUTABLE,
        "X-Cache": "HIT",
      });
      return new Response(object.body, { status: 200, headers });
    }
  }

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = await signTokenPayload({ session_key: sessionKey, exp }, env.CAR_TELEMETRY_UPLOAD_SECRET);
  return jsonResponse(
    { uploadToken: token, expiresAt: new Date(exp * 1000).toISOString() },
    202,
    { cacheControl: "no-store" },
  );
};

const handlePostCarTelemetry = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const rawSessionKey = url.searchParams.get("session_key");
  if (!rawSessionKey) {
    return jsonResponse({ error: "session_key is required" }, 400);
  }
  const sessionKey = Number(rawSessionKey);
  if (!Number.isFinite(sessionKey)) {
    return jsonResponse({ error: "session_key must be a number" }, 400);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return jsonResponse({ error: "Missing upload token" }, 401);
  }

  const tokenPayload = await verifyToken(token, env.CAR_TELEMETRY_UPLOAD_SECRET);
  if (!tokenPayload) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  if (tokenPayload.session_key !== sessionKey) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  // Store the raw payload body to avoid JSON parse/stringify overhead for large sessions.
  // Clients POST the CarTelemetryPayload JSON directly.
  if (!request.body) {
    return jsonResponse({ error: "Missing request body" }, 400);
  }

  const r2Key = `car-telemetry/${sessionKey}.json`;
  await env.CAR_TELEMETRY_BUCKET.put(r2Key, request.body, {
    httpMetadata: { contentType: "application/json" },
  });

  const contentLength = Number(request.headers.get("content-length") ?? "");
  const payloadSize = Number.isFinite(contentLength) ? contentLength : null;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO car_telemetry_cache (session_key, r2_key, payload_size, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(sessionKey, r2Key, payloadSize, new Date().toISOString())
    .run();

  return new Response(null, { status: 204 });
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      const headers = withCors(new Headers());
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname !== "/car-telemetry") {
      const headers = withCors(new Headers());
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers,
      });
    }

    try {
      if (request.method === "GET") {
        // Cloudflare edge cache (separate from D1/R2) to reduce read pressure.
        const cacheKey = new Request(request.url, { method: "GET" });
        const edgeHit = await caches.default.match(cacheKey);
        if (edgeHit) {
          const headers = withCors(new Headers(edgeHit.headers));
          headers.set("X-Cache", "EDGE");
          return new Response(edgeHit.body, { status: edgeHit.status, headers });
        }

        const originResponse = await handleGetCarTelemetry(request, env);
        const headers = withCors(new Headers(originResponse.headers));
        if (originResponse.status === 200) {
          const response = new Response(originResponse.body, {
            status: originResponse.status,
            headers,
          });
          ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
          return response;
        }
        return new Response(originResponse.body, { status: originResponse.status, headers });
      }

      let response: Response;
      if (request.method === "POST") {
        response = await handlePostCarTelemetry(request, env);
      } else {
        response = jsonResponse({ error: "Method not allowed" }, 405);
      }
      const headers = withCors(new Headers(response.headers));
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      const headers = withCors(new Headers());
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: new Headers({
          "Content-Type": "application/json; charset=utf-8",
          ...Object.fromEntries(headers),
        }),
      });
    }
  },
};
