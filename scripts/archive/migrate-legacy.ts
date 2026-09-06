import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { createGunzip, createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

type CacheKind = "replay" | "car-telemetry";

type CacheSpec = {
  kind: CacheKind;
  bucket: string;
  database: string;
  table: string;
  keyPrefix: string;
  endpoint: string;
  workerEnv: string;
};

type InventoryRow = {
  session_key: number;
  r2_key: string;
  payload_size: number | null;
  created_at: string;
};

type InventoryEntry = {
  kind: CacheKind;
  bucket: string;
  key: string;
  sessionKey: number;
  payloadSize: number | null;
  createdAt: string;
};

type Inventory = {
  createdAt: string;
  entries: InventoryEntry[];
  buckets: Record<CacheKind, { objectCount: number; sizeLabel: string }>;
};

type FileDigest = {
  path: string;
  bytes: number;
  sha256: string;
};

type BackupEntry = InventoryEntry & {
  raw?: FileDigest;
  gzip?: FileDigest;
  migrated?: {
    verifiedAt: string;
    etag: string;
    contentEncoding: string;
    cacheControl: string;
    decodedSha256: string;
  };
};

type BackupManifest = {
  version: 1;
  root: string;
  inventoryCreatedAt: string;
  backupStartedAt: string;
  backupCompletedAt?: string;
  entries: BackupEntry[];
};

const CACHES: CacheSpec[] = [
  {
    kind: "replay",
    bucket: "openf1-replay-cache",
    database: "openf1-replay",
    table: "replay_cache",
    keyPrefix: "replay/",
    endpoint: "/replay",
    workerEnv: "RSBUILD_WORKER_URL",
  },
  {
    kind: "car-telemetry",
    bucket: "openf1-car-telemetry-cache",
    database: "openf1-car-telemetry",
    table: "car_telemetry_cache",
    keyPrefix: "car-telemetry/",
    endpoint: "/car-telemetry",
    workerEnv: "RSBUILD_CAR_TELEMETRY_WORKER_URL",
  },
];

const DEFAULT_ROOT = "/tmp/f1-archive-backup";
const APPLY_CONFIRMATION = "readonly-workers-deployed-and-backup-verified";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const parseArgs = () => {
  const values = process.argv.slice(2);
  const command = values[0] ?? "inventory";
  const options = new Map<string, string>();
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${value}`);
    options.set(value.slice(2), next);
    index += 1;
  }
  return { command, options };
};

const run = async (command: string[], options: { quiet?: boolean } = {}) => {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command[0]} failed (${exitCode}): ${stderr.trim() || stdout.trim()}`);
  }
  if (!options.quiet && stderr.trim()) process.stderr.write(stderr);
  return stdout.trim();
};

const atomicJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
};

const queryRows = async (spec: CacheSpec): Promise<InventoryRow[]> => {
  const sql = [
    "SELECT session_key, r2_key, payload_size, created_at",
    `FROM ${spec.table}`,
    "WHERE r2_key IS NOT NULL AND r2_key != ''",
    "ORDER BY session_key",
  ].join(" ");
  const output = await run([
    "wrangler",
    "d1",
    "execute",
    spec.database,
    "--remote",
    "--command",
    sql,
    "--json",
  ]);
  const result = JSON.parse(output) as Array<{ results: InventoryRow[]; success: boolean }>;
  if (result.length !== 1 || !result[0]?.success) {
    throw new Error(`D1 inventory failed for ${spec.database}`);
  }
  return result[0].results;
};

const bucketInfo = async (bucket: string) => {
  const output = await run(["wrangler", "r2", "bucket", "info", bucket]);
  const objectCount = Number(/^object_count:\s+(\d+)$/m.exec(output)?.[1]);
  const sizeLabel = /^bucket_size:\s+(.+)$/m.exec(output)?.[1]?.trim();
  if (!Number.isSafeInteger(objectCount) || !sizeLabel) {
    throw new Error(`Could not parse bucket info for ${bucket}`);
  }
  return { objectCount, sizeLabel };
};

export const buildInventory = async (): Promise<Inventory> => {
  const entries: InventoryEntry[] = [];
  const buckets = {} as Inventory["buckets"];
  for (const spec of CACHES) {
    const [rows, info] = await Promise.all([queryRows(spec), bucketInfo(spec.bucket)]);
    if (rows.length !== info.objectCount) {
      throw new Error(
        `${spec.bucket} has ${info.objectCount} objects but ${rows.length} indexed R2 keys; refusing an incomplete inventory`,
      );
    }
    const keys = new Set<string>();
    for (const row of rows) {
      if (!Number.isSafeInteger(row.session_key) || row.session_key <= 0) {
        throw new Error(`Invalid session key in ${spec.database}: ${row.session_key}`);
      }
      const expectedKey = `${spec.keyPrefix}${row.session_key}.json`;
      if (row.r2_key !== expectedKey || keys.has(row.r2_key)) {
        throw new Error(`Unexpected or duplicate R2 key in ${spec.database}: ${row.r2_key}`);
      }
      keys.add(row.r2_key);
      entries.push({
        kind: spec.kind,
        bucket: spec.bucket,
        key: row.r2_key,
        sessionKey: row.session_key,
        payloadSize: row.payload_size,
        createdAt: row.created_at,
      });
    }
    buckets[spec.kind] = info;
  }
  return { createdAt: new Date().toISOString(), entries, buckets };
};

const digestFile = async (path: string): Promise<FileDigest> => {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    hash.update(buffer);
  }
  return { path, bytes, sha256: hash.digest("hex") };
};

const digestGunzip = async (path: string) => {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path).pipe(createGunzip())) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
};

const localPaths = (root: string, entry: InventoryEntry) => {
  const relativeKey = entry.key.replace(/\.json$/, "");
  return {
    raw: join(root, "raw", `${relativeKey}.json`),
    gzip: join(root, "gzip", `${relativeKey}.json.gz`),
  };
};

const download = async (entry: InventoryEntry, destination: string) => {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.download-${process.pid}`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await unlink(temporary).catch(() => undefined);
    try {
      await run([
        "wrangler",
        "r2",
        "object",
        "get",
        `${entry.bucket}/${entry.key}`,
        "--remote",
        "--file",
        temporary,
      ]);
      await rename(temporary, destination);
      return;
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      if (attempt === 4) throw error;
      await Bun.sleep(2 ** (attempt - 1) * 1000);
    }
  }
};

const gzip = async (source: string, destination: string) => {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.gzip-${process.pid}`;
  await unlink(temporary).catch(() => undefined);
  try {
    await pipeline(createReadStream(source), createGzip({ level: 9 }), createWriteStream(temporary));
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
};

const sameInventory = (manifest: BackupManifest, inventory: Inventory) => {
  if (manifest.entries.length !== inventory.entries.length) return false;
  return manifest.entries.every((entry, index) => {
    const current = inventory.entries[index];
    return (
      current &&
      entry.kind === current.kind &&
      entry.bucket === current.bucket &&
      entry.key === current.key &&
      entry.sessionKey === current.sessionKey &&
      entry.payloadSize === current.payloadSize &&
      entry.createdAt === current.createdAt
    );
  });
};

const readManifest = async (path: string): Promise<BackupManifest> =>
  JSON.parse(await readFile(path, "utf8")) as BackupManifest;

const backup = async (root: string, concurrency: number) => {
  const inventory = await buildInventory();
  const inventoryPath = join(root, "inventory.json");
  const manifestPath = join(root, "manifest.json");
  await atomicJson(inventoryPath, inventory);

  let manifest: BackupManifest;
  try {
    manifest = await readManifest(manifestPath);
    if (!sameInventory(manifest, inventory)) {
      throw new Error("Remote inventory changed since this backup started; use a new backup root");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    manifest = {
      version: 1,
      root,
      inventoryCreatedAt: inventory.createdAt,
      backupStartedAt: new Date().toISOString(),
      entries: inventory.entries.map((entry) => ({ ...entry })),
    };
    await atomicJson(manifestPath, manifest);
  }

  let cursor = 0;
  let completed = 0;
  let manifestWrite = Promise.resolve();
  const saveManifest = async () => {
    manifestWrite = manifestWrite.then(() => atomicJson(manifestPath, manifest));
    await manifestWrite;
  };
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const entry = manifest.entries[index];
      if (!entry) return;
      const paths = localPaths(root, entry);

      let raw: FileDigest | undefined;
      try {
        raw = await digestFile(paths.raw);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (!raw) {
        await download(entry, paths.raw);
        raw = await digestFile(paths.raw);
      }

      let compressed: FileDigest | undefined;
      try {
        compressed = await digestFile(paths.gzip);
        const decoded = await digestGunzip(paths.gzip);
        if (decoded.bytes !== raw.bytes || decoded.sha256 !== raw.sha256) compressed = undefined;
      } catch {
        compressed = undefined;
      }
      if (!compressed) {
        await gzip(paths.raw, paths.gzip);
        compressed = await digestFile(paths.gzip);
      }
      const decoded = await digestGunzip(paths.gzip);
      if (decoded.bytes !== raw.bytes || decoded.sha256 !== raw.sha256) {
        throw new Error(`Gzip round trip failed for ${entry.bucket}/${entry.key}`);
      }

      entry.raw = { ...raw, path: relative(root, paths.raw) };
      entry.gzip = { ...compressed, path: relative(root, paths.gzip) };
      completed += 1;
      await saveManifest();
      console.log(
        JSON.stringify({
          backedUp: completed,
          total: manifest.entries.length,
          bucket: entry.bucket,
          key: entry.key,
          d1PayloadSize: entry.payloadSize,
          rawBytes: raw.bytes,
          gzipBytes: compressed.bytes,
        }),
      );
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  manifest.backupCompletedAt = new Date().toISOString();
  await atomicJson(manifestPath, manifest);
  return manifest;
};

const validateCompleteBackup = async (manifest: BackupManifest) => {
  if (!manifest.backupCompletedAt) throw new Error("Backup manifest is not marked complete");
  for (const entry of manifest.entries) {
    if (!entry.raw || !entry.gzip) throw new Error(`Missing backup for ${entry.bucket}/${entry.key}`);
    const raw = await digestFile(join(manifest.root, entry.raw.path));
    const compressed = await digestFile(join(manifest.root, entry.gzip.path));
    const decoded = await digestGunzip(join(manifest.root, entry.gzip.path));
    if (
      raw.bytes !== entry.raw.bytes ||
      raw.sha256 !== entry.raw.sha256 ||
      compressed.bytes !== entry.gzip.bytes ||
      compressed.sha256 !== entry.gzip.sha256 ||
      decoded.bytes !== raw.bytes ||
      decoded.sha256 !== raw.sha256
    ) {
      throw new Error(`Backup integrity check failed for ${entry.bucket}/${entry.key}`);
    }
  }
};

const readEnv = async (path: string) => {
  const values = new Map<string, string>();
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
  }
  return values;
};

const verificationUrl = (base: string, entry: BackupEntry) => {
  const url = new URL(base);
  const spec = CACHES.find((candidate) => candidate.kind === entry.kind);
  if (!spec) throw new Error(`Unknown cache kind: ${entry.kind}`);
  const basePath = url.pathname.replace(/\/$/, "");
  if (!basePath.endsWith(spec.endpoint)) url.pathname = `${basePath}${spec.endpoint}`;
  url.searchParams.set("session_key", String(entry.sessionKey));
  url.searchParams.set("migration_verify", entry.raw?.sha256.slice(0, 16) ?? "missing");
  return url;
};

const assertWorkersReadOnly = async (workers: Map<string, string>, entries: BackupEntry[]) => {
  for (const spec of CACHES) {
    const base = workers.get(spec.workerEnv);
    const entry = entries.find((candidate) => candidate.kind === spec.kind);
    if (!base || !entry) throw new Error(`Missing ${spec.workerEnv} or ${spec.kind} inventory entry`);
    const response = await fetch(verificationUrl(base, entry), { method: "POST" });
    if (response.status !== 405) {
      throw new Error(`${spec.kind} Worker returned ${response.status} to POST; expected read-only 405`);
    }
  }
};

const verifyRemote = async (base: string, entry: BackupEntry, root: string) => {
  if (!entry.raw) throw new Error("Missing raw digest");
  const url = verificationUrl(base, entry);
  const head = await fetch(url, { method: "HEAD", headers: { "Cache-Control": "no-cache" } });
  if (!head.ok) throw new Error(`HEAD verification failed (${head.status}) for ${entry.key}`);
  const encoding = head.headers.get("content-encoding") ?? "";
  const cacheControl = head.headers.get("cache-control") ?? "";
  const etag = head.headers.get("etag") ?? "";
  if (encoding.toLowerCase() !== "gzip" || cacheControl !== IMMUTABLE_CACHE_CONTROL || !etag) {
    throw new Error(`HTTP metadata verification failed for ${entry.key}`);
  }

  const verifyPath = join(root, "verify", `${entry.kind}-${entry.sessionKey}.json`);
  await mkdir(dirname(verifyPath), { recursive: true });
  await run([
    "curl",
    "--fail",
    "--silent",
    "--show-error",
    "--compressed",
    "--output",
    verifyPath,
    url.toString(),
  ]);
  const decoded = await digestFile(verifyPath);
  await unlink(verifyPath);
  if (decoded.bytes !== entry.raw.bytes || decoded.sha256 !== entry.raw.sha256) {
    throw new Error(`Decoded HTTP readback digest failed for ${entry.key}`);
  }
  return { etag, encoding, cacheControl, decodedSha256: decoded.sha256 };
};

const putRemote = async (entry: BackupEntry, gzipPath: string) => {
  const command = [
    "wrangler",
    "r2",
    "object",
    "put",
    `${entry.bucket}/${entry.key}`,
    "--remote",
    "--file",
    gzipPath,
    "--content-type",
    "application/json",
    "--content-encoding",
    "gzip",
    "--cache-control",
    IMMUTABLE_CACHE_CONTROL,
  ];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await run(command);
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await Bun.sleep(2 ** (attempt - 1) * 1000);
    }
  }
};

const apply = async (root: string, confirmation: string, envPath: string) => {
  if (confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`Apply is locked; pass --confirm ${APPLY_CONFIRMATION} only after approval`);
  }
  const manifestPath = join(root, "manifest.json");
  const manifest = await readManifest(manifestPath);
  await validateCompleteBackup(manifest);

  const inventory = await buildInventory();
  if (!sameInventory(manifest, inventory)) {
    throw new Error("Remote inventory changed after backup; refusing to rewrite objects");
  }
  const workers = await readEnv(envPath);
  await assertWorkersReadOnly(workers, manifest.entries);

  for (const entry of manifest.entries) {
    if (entry.migrated) continue;
    if (!entry.gzip) throw new Error(`Missing gzip backup for ${entry.key}`);
    const gzipPath = join(root, entry.gzip.path);
    await putRemote(entry, gzipPath);
    const spec = CACHES.find((candidate) => candidate.kind === entry.kind);
    const base = spec ? workers.get(spec.workerEnv) : undefined;
    if (!base) throw new Error(`Missing Worker URL for ${entry.kind}`);
    const verified = await verifyRemote(base, entry, root);
    entry.migrated = {
      verifiedAt: new Date().toISOString(),
      etag: verified.etag,
      contentEncoding: verified.encoding,
      cacheControl: verified.cacheControl,
      decodedSha256: verified.decodedSha256,
    };
    await atomicJson(manifestPath, manifest);
    console.log(JSON.stringify({ migrated: entry.bucket, key: entry.key, verified: true }));
  }
  return manifest;
};

const summarize = (inventory: Inventory | BackupManifest) => {
  const entries = inventory.entries;
  const rawBytes = entries.reduce(
    (total, entry) => total + ("raw" in entry && entry.raw ? entry.raw.bytes : entry.payloadSize ?? 0),
    0,
  );
  const gzipBytes = entries.reduce(
    (total, entry) => total + ("gzip" in entry && entry.gzip ? entry.gzip.bytes : 0),
    0,
  );
  return {
    objects: entries.length,
    rawBytes,
    gzipBytes: gzipBytes || undefined,
    reductionPercent: gzipBytes ? Number(((1 - gzipBytes / rawBytes) * 100).toFixed(2)) : undefined,
  };
};

const main = async () => {
  const { command, options } = parseArgs();
  const root = options.get("root") ?? DEFAULT_ROOT;
  if (command === "inventory") {
    const inventory = await buildInventory();
    await atomicJson(join(root, "inventory.json"), inventory);
    console.log(JSON.stringify({ ...summarize(inventory), root }, null, 2));
    return;
  }
  if (command === "backup") {
    const concurrency = Number(options.get("concurrency") ?? "2");
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) {
      throw new Error("--concurrency must be an integer from 1 to 4");
    }
    const manifest = await backup(root, concurrency);
    console.log(JSON.stringify({ ...summarize(manifest), root, complete: true }, null, 2));
    return;
  }
  if (command === "apply") {
    const manifest = await apply(
      root,
      options.get("confirm") ?? "",
      options.get("env") ?? ".env",
    );
    console.log(
      JSON.stringify(
        { ...summarize(manifest), root, migrated: manifest.entries.filter((e) => e.migrated).length },
        null,
        2,
      ),
    );
    return;
  }
  throw new Error(
    "Usage: bun scripts/archive/migrate-legacy.ts <inventory|backup|apply> [--root /tmp/f1-archive-backup]",
  );
};

if (import.meta.main) {
  await main();
}
