type ReplayCacheRow = {
  session_key: number;
  payload: string;
  r2_key?: string | null;
  payload_size?: number | null;
  created_at: string;
};

type ReplayUploadBody = {
  session_key: number;
  payload: unknown;
};

type UploadTokenPayload = {
  session_key: number;
  exp: number;
};

type Env = {
  DB: D1Database;
  REPLAY_BUCKET: R2Bucket;
  REPLAY_UPLOAD_SECRET: string;
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

const withCors = (headers: Headers, origin: string | null) => {
  headers.set("Access-Control-Allow-Origin", origin ?? "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

const handleGetReplay = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const sessionKey = Number(url.searchParams.get("session_key"));
  if (!Number.isFinite(sessionKey)) {
    return jsonResponse({ error: "session_key is required" }, 400);
  }

  const cached = await env.DB.prepare(
    "SELECT session_key, payload, r2_key, payload_size, created_at FROM replay_cache WHERE session_key = ?",
  )
    .bind(sessionKey)
    .first<ReplayCacheRow>();

  if (cached?.r2_key) {
    const object = await env.REPLAY_BUCKET.get(cached.r2_key);
    if (object) {
      const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": CACHE_CONTROL_IMMUTABLE,
        "X-Cache": "HIT",
      });
      return new Response(object.body, { status: 200, headers });
    }
  }

  if (cached?.payload) {
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": CACHE_CONTROL_IMMUTABLE,
      "X-Cache": "HIT",
    });
    return new Response(cached.payload, { status: 200, headers });
  }

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = await signTokenPayload({ session_key: sessionKey, exp }, env.REPLAY_UPLOAD_SECRET);
  return jsonResponse(
    { uploadToken: token, expiresAt: new Date(exp * 1000).toISOString() },
    202,
    { cacheControl: "no-store" },
  );
};

const handlePostReplay = async (request: Request, env: Env) => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return jsonResponse({ error: "Missing upload token" }, 401);
  }

  const body = (await request.json()) as ReplayUploadBody;
  if (!body || typeof body.session_key !== "number" || body.payload === undefined) {
    return jsonResponse({ error: "Invalid payload" }, 400);
  }

  const tokenPayload = await verifyToken(token, env.REPLAY_UPLOAD_SECRET);
  if (!tokenPayload || tokenPayload.session_key !== body.session_key) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  const payloadText = JSON.stringify(body.payload);
  const r2Key = `replay/${body.session_key}.json`;
  await env.REPLAY_BUCKET.put(r2Key, payloadText, {
    httpMetadata: { contentType: "application/json" },
  });
  await env.DB.prepare(
    "INSERT OR REPLACE INTO replay_cache (session_key, payload, r2_key, payload_size, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(body.session_key, "", r2Key, payloadText.length, new Date().toISOString())
    .run();

  return new Response(null, { status: 204 });
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      const headers = withCors(new Headers(), origin);
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname !== "/replay") {
      const headers = withCors(new Headers(), origin);
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers,
      });
    }

    try {
      let response: Response;
      if (request.method === "GET") {
        response = await handleGetReplay(request, env);
      } else if (request.method === "POST") {
        response = await handlePostReplay(request, env);
      } else {
        response = jsonResponse({ error: "Method not allowed" }, 405);
      }
      const headers = withCors(new Headers(response.headers), origin);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      const headers = withCors(new Headers(), origin);
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
