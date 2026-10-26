type Env = {
  ARCHIVE_BUCKET: R2Bucket;
};

type WorkerResponseInit = ResponseInit & { encodeBody?: "manual" };

// Only the mutable catalog and content-addressed objects are public; nothing else in the bucket is.
const ARCHIVE_KEY = /^\/(catalog\.json|objects\/[0-9a-f]{64}\.json)$/;

// Mirrors the bucket CORS policy the custom domain served.
const withCors = (headers: Headers) => {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD");
  headers.set("Access-Control-Expose-Headers", "ETag, Content-Length, Cache-Control");
  return headers;
};

const errorResponse = (status: number, message: string, headOnly: boolean, allow?: string) => {
  const headers = withCors(
    new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }),
  );
  if (allow) headers.set("Allow", allow);
  return new Response(headOnly ? null : message, { status, headers });
};

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "OPTIONS") {
      const headers = withCors(new Headers());
      headers.set("Access-Control-Max-Age", "86400");
      return new Response(null, { status: 204, headers });
    }
    const headOnly = request.method === "HEAD";
    if (request.method !== "GET" && !headOnly) {
      return errorResponse(405, "Method not allowed", false, "GET, HEAD, OPTIONS");
    }
    const key = ARCHIVE_KEY.exec(new URL(request.url).pathname)?.[1];
    if (!key) return errorResponse(404, "Not found", headOnly);

    let object: R2Object | R2ObjectBody | null;
    try {
      object = headOnly ? await env.ARCHIVE_BUCKET.head(key) : await env.ARCHIVE_BUCKET.get(key);
    } catch {
      return errorResponse(503, "Archive storage unavailable", headOnly);
    }
    if (!object) return errorResponse(404, "Not found", headOnly);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    withCors(headers);
    // GET came from bucket.get(), which always returns a body.
    const body = headOnly ? null : (object as R2ObjectBody).body;
    // Objects are stored gzip-compressed; manual encoding sends those bytes without recompressing.
    const init: WorkerResponseInit = { status: 200, headers, encodeBody: "manual" };
    return new Response(body, init);
  },
};
