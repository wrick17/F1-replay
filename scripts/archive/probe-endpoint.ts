import { DEFAULT_ARCHIVE_CATALOG_URL, validateCatalog } from "../../src/modules/archive";

// The object whose public read failed in the blocked publisher runs.
const PROBE_OBJECT = "objects/2c039ebe4b599ae271cac297f91e3dd3841576448579c359dfcd33a6b0d02798.json";
const ATTEMPTS = 3;
const LOGGED_HEADERS = [
  "content-type",
  "content-encoding",
  "cache-control",
  "access-control-allow-origin",
  "etag",
  "cf-mitigated",
  "cf-ray",
  "server",
];

const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

// Reads one raw response and returns every way it fails the publisher's public-read contract.
export const checkArchiveResponse = async (path: string, response: Response) => {
  const problems: string[] = [];
  const header = (name: string) => response.headers.get(name) ?? "";
  const immutable = path !== "catalog.json";
  const cacheControl = header("cache-control");
  if (response.status !== 200) problems.push(`status ${response.status}`);
  if (response.headers.has("cf-mitigated")) problems.push(`cf-mitigated=${header("cf-mitigated")}`);
  if (header("content-encoding") !== "gzip") problems.push("Content-Encoding is not gzip");
  if (!header("content-type").toLowerCase().includes("application/json")) {
    problems.push("Content-Type is not JSON");
  }
  if (
    immutable
      ? !cacheControl.includes("max-age=31536000") || !cacheControl.includes("immutable")
      : !cacheControl.includes("max-age=300")
  ) {
    problems.push(`Cache-Control=${cacheControl}`);
  }
  if (header("access-control-allow-origin") !== "*") problems.push("CORS origin is not *");
  if (problems.length) {
    await response.body?.cancel();
    return { problems, bytes: 0, sha256: "" };
  }
  const raw = new Uint8Array(await response.arrayBuffer());
  let decoded: Uint8Array;
  try {
    decoded = Bun.gunzipSync(raw);
  } catch {
    return { problems: ["body is not gzip"], bytes: raw.byteLength, sha256: "" };
  }
  const hash = sha256(decoded);
  if (immutable && !path.includes(hash)) problems.push(`decoded SHA-256 ${hash} does not match path`);
  if (!immutable) {
    try {
      validateCatalog(JSON.parse(new TextDecoder().decode(decoded)));
    } catch (error) {
      problems.push(`invalid catalog: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { problems, bytes: raw.byteLength, sha256: hash };
};

const main = async () => {
  let failed = false;
  const catalogHashes = new Set<string>();
  for (const path of ["catalog.json", PROBE_OBJECT]) {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      const url = new URL(`${path}?probe=${Date.now()}-${attempt}`, DEFAULT_ARCHIVE_CATALOG_URL);
      let result: { status?: number; headers?: Record<string, string>; problems: string[] };
      try {
        const response = await fetch(url, {
          cache: "no-store",
          // Raw bytes prove the endpoint serves the stored gzip body rather than a decoded copy.
          decompress: false,
          // Without an explicit gzip Accept-Encoding, Bun's raw mode lets the edge send identity bytes.
          headers: {
            accept: "application/json",
            "accept-encoding": "gzip",
            origin: "https://f1.wrick17.com",
          },
          signal: AbortSignal.timeout(30_000),
        });
        const headers = Object.fromEntries(
          LOGGED_HEADERS.flatMap((name) => {
            const value = response.headers.get(name);
            return value ? [[name, value]] : [];
          }),
        );
        const checked = await checkArchiveResponse(path, response);
        if (path === "catalog.json" && checked.sha256) catalogHashes.add(checked.sha256);
        result = { status: response.status, headers, ...checked };
      } catch (error) {
        result = { problems: [`request failed: ${error instanceof Error ? error.name : "error"}`] };
      }
      // Status, headers, and hashes only; bodies are never logged.
      console.log(JSON.stringify({ url: url.href, attempt, ...result }));
      for (const problem of result.problems) console.log(`::error::${path} attempt ${attempt}: ${problem}`);
      failed ||= result.problems.length > 0;
    }
  }
  // The checked-in snapshot is the last activated catalog, pretty-printed; the bucket stores it compact.
  const snapshot = Bun.file("public/archive/catalog.json");
  if (await snapshot.exists()) {
    const expected = sha256(new TextEncoder().encode(JSON.stringify(await snapshot.json())));
    const matches = catalogHashes.size === 1 && catalogHashes.has(expected);
    console.log(JSON.stringify({ snapshotSha256: expected, catalogSha256: [...catalogHashes], matches }));
    if (!matches) console.log("::warning::Public catalog differs from the checked-out snapshot");
  }
  if (failed) process.exit(1);
};

if (import.meta.main) await main();
