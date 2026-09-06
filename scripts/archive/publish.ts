import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  ARCHIVE_SCHEMA_VERSION,
  archiveSessionType,
  buildSessionArchive,
  type ArchiveCatalog,
  type ArchiveCatalogSession,
  type ArchiveManifest,
  type BuiltArchive,
  loadArchivedTrackGeometry,
  loadManifest,
  loadReplayCore,
  loadReplaySession,
  validateBuiltArchive,
  validateCatalog,
} from "../../src/modules/archive";
import { buildTrackGeometry } from "../../src/modules/replay/services/trackBuilder.service";
import type { CarTelemetryPayload } from "../../src/modules/replay/types/carTelemetry.types";
import type {
  OpenF1Meeting,
  OpenF1Session,
  ReplaySessionData,
  TrackGeometry,
} from "../../src/modules/replay/types/openf1.types";
import { buildCarTelemetryPayload } from "../../src/modules/replay/warm/buildCarTelemetryPayload";
import { buildReplayPayload } from "../../src/modules/replay/warm/buildReplayPayload";

const OPENF1_URL = "https://api.openf1.org/v1";
const JOLPICA_URL = "https://api.jolpi.ca/ergast/f1";
const DATA_URL = "https://data.f1.wrick17.com/";
const encoder = new TextEncoder();
const OPENF1_COLLECTIONS = new Set([
  "car_data",
  "drivers",
  "laps",
  "location",
  "meetings",
  "overtakes",
  "pit",
  "position",
  "race_control",
  "sessions",
  "stints",
  "team_radio",
  "weather",
]);

type PublisherArgs = {
  catalog?: string;
  dryRun: boolean;
  importDir?: string;
  importOnly: boolean;
  maxSessions: number;
  out?: string;
  quarantine: string;
  repairInvalidCores: boolean;
  snapshot: string;
  years: number[];
};

type Upload = (path: string, content: string, immutable: boolean) => Promise<void>;

type JolpicaRace = {
  round?: string;
  date?: string;
  raceName?: string;
};

type CircuitPayload = {
  circuitKey?: number;
  year?: number;
  rotation?: number;
  x?: unknown[];
  y?: unknown[];
};

type QuarantinedLegacyObject = {
  kind: "replay" | "car";
  key: number;
  reason: string;
};

class OpenF1AuthError extends Error {}
class LegacyDataError extends Error {}

const sha256 = async (content: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchSignal = () => AbortSignal.timeout(30_000);

const retryAfterMs = (response: Response, attempt: number) => {
  const header = response.headers.get("retry-after");
  const seconds = Number(header);
  if (header && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = header ? Date.parse(header) : Number.NaN;
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return Math.min(30_000, 2_000 * 2 ** attempt);
};

const fetchWithRetry = async (
  url: string,
  options: {
    pace?: () => Promise<void>;
    attempts?: number;
    emptyOpenF1Collection?: boolean;
    signal?: AbortSignal;
  } = {},
) => {
  const attempts = options.attempts ?? 4;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    options.signal?.throwIfAborted();
    await options.pace?.();
    options.signal?.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: options.signal
          ? AbortSignal.any([options.signal, fetchSignal()])
          : fetchSignal(),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (attempt === attempts - 1) throw error;
      await sleep(Math.min(30_000, 2_000 * 2 ** attempt));
      continue;
    }
    if (response.status === 401) throw new OpenF1AuthError(`OpenF1 denied ${url}`);
    if (response.ok) return response;
    if (response.status === 404 && options.emptyOpenF1Collection) {
      const payload = (await response.clone().json().catch(() => undefined)) as
        | { detail?: unknown }
        | undefined;
      if (payload?.detail === "No results found.") {
        return new Response("[]", { headers: { "content-type": "application/json" } });
      }
    }
    if ((response.status !== 429 && response.status < 500) || attempt === attempts - 1) {
      throw new Error(`Request failed ${response.status}: ${url}`);
    }
    await sleep(Math.min(30_000, retryAfterMs(response, attempt)));
  }
  throw new Error(`Request failed: ${url}`);
};

const createPace = (intervalMs: number) => {
  let chain = Promise.resolve(0);
  return () => {
    chain = chain.then(async (lastRequestAt) => {
      const wait = intervalMs - (Date.now() - lastRequestAt);
      if (wait > 0) await sleep(wait);
      return Date.now();
    });
    return chain.then(() => undefined);
  };
};

const query = (params: Record<string, string | number>) =>
  Object.entries(params)
    .map(([key, value]) =>
      key.includes(">") || key.includes("<")
        ? `${key}${encodeURIComponent(value)}`
        : `${key}=${encodeURIComponent(value)}`,
    )
    .join("&");

export const createOpenF1 = (
  baseUrl = OPENF1_URL,
  intervalMs = 2_000,
  signal?: AbortSignal,
  sharedPace?: () => Promise<void>,
) => {
  const pace = sharedPace ?? createPace(intervalMs);
  const fetchOpenF1 = async <T>(path: string, params: Record<string, string | number>) => {
    const suffix = query(params);
    const response = await fetchWithRetry(`${baseUrl}/${path}${suffix ? `?${suffix}` : ""}`, {
      pace,
      emptyOpenF1Collection: OPENF1_COLLECTIONS.has(path),
      signal,
    });
    return (await response.json()) as T;
  };
  const fetchChunked = async <T extends { date?: string }>(
    path: string,
    params: Record<string, string | number>,
    startMs: number,
    endMs: number,
    windowMs: number,
    onChunk: (chunk: T[], chunkEndMs: number) => void,
  ) => {
    let total = 0;
    for (let cursor = startMs; cursor < endMs; cursor += windowMs) {
      const chunkEnd = Math.min(cursor + windowMs, endMs);
      const chunk = await fetchOpenF1<T[]>(path, {
        ...params,
        "date>=": new Date(cursor).toISOString(),
        "date<=": new Date(chunkEnd).toISOString(),
      });
      total += chunk.length;
      onChunk(chunk, chunkEnd);
    }
    return total;
  };
  return { fetchOpenF1, fetchChunked, pace };
};

export const parsePublisherArgs = (argv: string[]): PublisherArgs => {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const allYears = argv.includes("--all-years");
  if (allYears && value("--years")) throw new Error("--all-years cannot be combined with --years");
  const currentYear = new Date().getUTCFullYear();
  const years = allYears
    ? Array.from({ length: currentYear - 2022 }, (_, index) => 2023 + index)
    : (value("--years") ?? `${currentYear}`)
        .split(",")
        .map(Number)
        .filter((year) => Number.isInteger(year) && year >= 2018);
  if (!years.length) throw new Error("--years must contain a year from 2018 onward");
  const maxSessions = Number(value("--max-sessions") ?? 2);
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 100) {
    throw new Error("--max-sessions must be an integer from 1 to 100");
  }
  return {
    catalog: value("--catalog"),
    dryRun: argv.includes("--dry-run"),
    importDir: value("--import-dir"),
    importOnly: argv.includes("--import-only"),
    maxSessions,
    out: value("--out"),
    quarantine: value("--quarantine") ?? "/tmp/f1-archive-import-quarantine.json",
    repairInvalidCores: argv.includes("--repair-invalid-cores"),
    snapshot: value("--snapshot") ?? "public/archive/catalog.json",
    years,
  };
};

const readJsonFile = async <T>(path: string): Promise<T> => {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const decoded = path.endsWith(".gz") ? Bun.gunzipSync(bytes) : bytes;
  return JSON.parse(new TextDecoder().decode(decoded)) as T;
};

const legacyObject = (value: unknown, name: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LegacyDataError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
};

export const decodeLegacyReplay = (value: unknown, expectedSessionKey: number) => {
  const outer = legacyObject(value, "replay");
  const candidate = outer.session
    ? outer
    : legacyObject(outer.payload ?? outer.data, "replay payload");
  const meeting = legacyObject(candidate.meeting, "replay meeting");
  const session = legacyObject(candidate.session, "replay session");
  const type = archiveSessionType(session as ReplaySessionData["session"]);
  if (!type) {
    throw new LegacyDataError(
      `replay ${expectedSessionKey} has unsupported session name ${String(session.session_name)}`,
    );
  }
  const arrays = ["drivers", "teamRadios", "overtakes", "weather", "raceControl", "pits"];
  const telemetry = legacyObject(candidate.telemetryByDriver, "replay telemetry");
  let locations = 0;
  for (const value of Object.values(telemetry)) {
    const driver = legacyObject(value, "replay driver telemetry");
    if (!Array.isArray(driver.locations) || !Array.isArray(driver.laps)) {
      throw new LegacyDataError(`replay ${expectedSessionKey} has invalid telemetry`);
    }
    locations += driver.locations.length;
  }
  if (
    session.session_key !== expectedSessionKey ||
    !Number.isSafeInteger(session.session_key) ||
    !Number.isSafeInteger(session.year) ||
    session.year !== meeting.year ||
    session.meeting_key !== meeting.meeting_key ||
    !Number.isFinite(candidate.sessionStartMs) ||
    !Number.isFinite(candidate.sessionEndMs) ||
    (candidate.sessionEndMs as number) <= (candidate.sessionStartMs as number) ||
    !Array.isArray(candidate.drivers) ||
    !candidate.drivers.length ||
    !Object.keys(telemetry).length ||
    !locations ||
    arrays.some((name) => !Array.isArray(candidate[name]))
  ) {
    throw new LegacyDataError(`replay ${expectedSessionKey} has an invalid schema`);
  }
  return candidate as ReplaySessionData;
};

export const normalizeExistingCatalog = (value: unknown) => {
  const catalog = legacyObject(value, "catalog");
  if (!Array.isArray(catalog.sessions)) return validateCatalog(value);
  const sessions = catalog.sessions.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [value];
    const entry = value as Record<string, unknown>;
    if (!entry.session || typeof entry.session !== "object" || Array.isArray(entry.session)) {
      return [value];
    }
    const type = archiveSessionType(entry.session as ReplaySessionData["session"]);
    return type ? [{ ...entry, type }] : [];
  });
  return validateCatalog({ ...catalog, sessions });
};

export const decodeLegacyCar = (value: unknown, expectedSessionKey: number) => {
  const car = legacyObject(value, "car telemetry");
  const byDriver = legacyObject(car.byDriver, "car telemetry drivers");
  let samples = 0;
  if (
    car.sessionKey !== expectedSessionKey ||
    car.sampleIntervalMs !== 500 ||
    typeof car.createdAt !== "string" ||
    !Number.isFinite(Date.parse(car.createdAt))
  ) {
    throw new LegacyDataError(`car telemetry ${expectedSessionKey} has an invalid schema`);
  }
  for (const [driver, value] of Object.entries(byDriver)) {
    if (!Number.isSafeInteger(Number(driver)) || Number(driver) < 1 || !Array.isArray(value)) {
      throw new LegacyDataError(`car telemetry ${expectedSessionKey} has an invalid driver`);
    }
    let previous = Number.NEGATIVE_INFINITY;
    for (const item of value) {
      const sample = legacyObject(item, "car telemetry sample");
      if (
        ["timestampMs", "speed", "gear", "rpm", "throttle", "brake", "drs"].some(
          (name) => !Number.isFinite(sample[name]),
        ) ||
        (sample.timestampMs as number) < previous
      ) {
        throw new LegacyDataError(`car telemetry ${expectedSessionKey} has an invalid sample`);
      }
      previous = sample.timestampMs as number;
      samples += 1;
    }
  }
  if (!samples) throw new LegacyDataError(`car telemetry ${expectedSessionKey} has no samples`);
  return car as CarTelemetryPayload;
};

export const loadExistingCatalog = async (args: PublisherArgs) => {
  if (args.catalog) return normalizeExistingCatalog(await readJsonFile(args.catalog));
  const response = await fetch(`${DATA_URL}catalog.json?publisher=${Date.now()}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: fetchSignal(),
  });
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
  return normalizeExistingCatalog(await response.json());
};

const sessionId = (session: Pick<ArchiveCatalogSession, "year" | "round" | "type">) =>
  `${session.year}/${session.round}/${session.type}`;

export const mergeCatalog = (
  existing: ArchiveCatalog,
  additions: ArchiveCatalogSession[],
  updatedAt: string,
): ArchiveCatalog => {
  if (!additions.length) return existing;
  const sessions = new Map(existing.sessions.map((session) => [sessionId(session), session]));
  for (const session of additions) sessions.set(sessionId(session), session);
  const rank = (type: string) => (type === "Qualifying" ? 0 : type === "Sprint" ? 1 : 2);
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    updatedAt,
    sessions: [...sessions.values()].sort(
      (a, b) =>
        b.year - a.year || a.round - b.round || rank(a.type) - rank(b.type) || a.sessionKey - b.sessionKey,
    ),
  };
};

export const publishArchiveObjects = async (
  archive: BuiltArchive,
  upload: Upload,
  reuse?: ArchiveManifest,
) => {
  const manifestPath = archive.catalog.sessions[0].manifest.url;
  const reusablePaths = new Set([
    ...(reuse?.locations.map((chunk) => chunk.url) ?? []),
    ...(reuse?.car?.chunks.map((chunk) => chunk.url) ?? []),
  ]);
  const objects = [...archive.files].filter(
    ([path]) => path !== "catalog.json" && path !== manifestPath && !reusablePaths.has(path),
  );
  for (let index = 0; index < objects.length; index += 8) {
    await Promise.all(
      objects.slice(index, index + 8).map(([path, content]) => upload(path, content, true)),
    );
  }
  const manifest = archive.files.get(manifestPath);
  if (!manifest) throw new Error("Built archive is missing its manifest object");
  await upload(manifestPath, manifest, true);
};

export const publishCatalog = async (catalog: ArchiveCatalog, upload: Upload) => {
  await upload("catalog.json", JSON.stringify(catalog), false);
};

const localUpload = (out?: string): Upload => async (path, content) => {
  const hash = /^objects\/([a-f0-9]{64})\.json$/.exec(path)?.[1];
  if (hash && (await sha256(content)) !== hash) throw new Error(`Hash path mismatch: ${path}`);
  if (!out) return;
  const destination = join(out, path);
  await mkdir(dirname(destination), { recursive: true });
  await Bun.write(destination, content);
};

const createR2Client = () => {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.S3_ENDPOINT;
  if (!accessKeyId) throw new Error("Missing S3_ACCESS_KEY_ID");
  if (!secretAccessKey) throw new Error("Missing S3_SECRET_ACCESS_KEY");
  if (!endpoint) throw new Error("Missing S3_ENDPOINT");
  return new Bun.S3Client({
    bucket: "f1-archive",
    endpoint,
    accessKeyId,
    secretAccessKey,
    region: process.env.S3_REGION ?? "auto",
  });
};

export const preflightR2 = async (
  bucket: ReturnType<typeof createR2Client>,
  allowMissingCatalog: boolean,
) => {
  const response = await fetch(bucket.file("catalog.json").presign({ method: "HEAD", expiresIn: 60 }), {
    method: "HEAD",
    signal: fetchSignal(),
  });
  if (response.ok || (allowMissingCatalog && response.status === 404)) return;
  throw new Error(`R2 catalog preflight failed: ${response.status}`);
};

const r2Upload = (bucket: ReturnType<typeof createR2Client>): Upload => {
  let publicHeaderVerification: Promise<void> | undefined;
  return async (path, content, immutable) => {
    const hash = /^objects\/([a-f0-9]{64})\.json$/.exec(path)?.[1];
    if (hash && (await sha256(content)) !== hash) throw new Error(`Hash path mismatch: ${path}`);
    const file = bucket.file(path);
    const verify = async () => {
      const response = await fetch(file.presign({ method: "GET", expiresIn: 60 }), {
        signal: fetchSignal(),
      });
      if (!response.ok) throw new Error(`R2 verification failed: ${path} (${response.status})`);
      const stored = new Uint8Array(await response.arrayBuffer());
      const decoded = stored[0] === 0x1f && stored[1] === 0x8b ? Bun.gunzipSync(stored) : stored;
      if (new TextDecoder().decode(decoded) !== content) throw new Error(`R2 verification failed: ${path}`);
    };
    if (immutable) {
      const response = await fetch(file.presign({ method: "HEAD", expiresIn: 60 }), {
        method: "HEAD",
        signal: fetchSignal(),
      });
      if (response.ok) {
        await verify();
        return;
      }
      if (response.status !== 404) throw new Error(`R2 HEAD failed: ${path} (${response.status})`);
    }
    const compressed = Bun.gzipSync(encoder.encode(content));
    const cacheControl = immutable
      ? "public,max-age=31536000,immutable"
      : "public,max-age=300";
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(file.presign({ method: "PUT", expiresIn: 60 }), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          "Cache-Control": cacheControl,
        },
        body: compressed,
        signal: fetchSignal(),
      });
      if (response.ok) break;
      if (response.status < 500 || attempt === 3) {
        throw new Error(`R2 upload failed: ${path} (${response.status})`);
      }
      await sleep(1_000 * 2 ** attempt);
    }
    await verify();
    if (immutable) {
      publicHeaderVerification ??= (async () => {
        for (let attempt = 0; ; attempt += 1) {
          const response = await fetch(`${DATA_URL}${path}?verify=${Date.now()}`, {
            cache: "no-store",
            signal: fetchSignal(),
          });
          if (response.ok) {
            if (response.headers.get("content-encoding") !== "gzip") {
              throw new Error(`Public object is missing gzip Content-Encoding: ${path}`);
            }
            if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
              throw new Error(`Public object is missing JSON Content-Type: ${path}`);
            }
            const publicCacheControl = response.headers.get("cache-control") ?? "";
            if (
              !publicCacheControl.includes("max-age=31536000") ||
              !publicCacheControl.includes("immutable")
            ) {
              throw new Error(`Public object has invalid Cache-Control: ${path}`);
            }
            if ((await response.text()) !== content) throw new Error(`Public object mismatch: ${path}`);
            console.log(
              `Verified public headers for ${path}; cache-control=${publicCacheControl}`,
            );
            return;
          }
          if (attempt === 3) throw new Error(`Public object unavailable: ${path} (${response.status})`);
          await sleep(2_000 * 2 ** attempt);
        }
      })();
      await publicHeaderVerification;
    }
  };
};

const walk = async (directory: string): Promise<string[]> => {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(path)));
    else if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      (path.endsWith(".json") || path.endsWith(".json.gz"))
    )
      paths.push(path);
  }
  return paths.sort();
};

const fileSessionKey = (path: string) => Number(basename(path).replace(/\.json(?:\.gz)?$/, ""));

const firstImportFiles = async (directory: string, candidates: string[]) => {
  for (const candidate of candidates) {
    const files = await walk(join(directory, candidate));
    if (files.length) return files;
  }
  return [];
};

const loadCalendar = async (year: number) => {
  const response = await fetchWithRetry(`${JOLPICA_URL}/${year}/races/`);
  const payload = (await response.json()) as {
    MRData?: { RaceTable?: { Races?: JolpicaRace[] } };
  };
  return payload.MRData?.RaceTable?.Races ?? [];
};

export const officialRound = (meeting: OpenF1Meeting, races: JolpicaRace[]) => {
  const raceDate = meeting.date_end.slice(0, 10);
  let matches = races.filter((race) => race.date === raceDate);
  if (matches.length !== 1) {
    const meetingEnd = Date.parse(meeting.date_end);
    matches = races.filter(
      (race) =>
        race.raceName === meeting.meeting_name &&
        typeof race.date === "string" &&
        Math.abs(Date.parse(race.date) - meetingEnd) <= 48 * 60 * 60 * 1000,
    );
  }
  if (matches.length !== 1) throw new Error(`No unique official round for ${meeting.meeting_name}`);
  const round = Number(matches[0].round);
  if (!Number.isSafeInteger(round) || round < 1) throw new Error(`Invalid official round for ${raceDate}`);
  return round;
};

const canonicalGeometry = async (meeting: OpenF1Meeting): Promise<TrackGeometry | undefined> => {
  if (!meeting.circuit_key || !meeting.circuit_info_url) return undefined;
  const url = new URL(meeting.circuit_info_url);
  if (
    url.origin !== "https://api.multiviewer.app" ||
    url.pathname !== `/api/v1/circuits/${meeting.circuit_key}/${meeting.year}` ||
    url.search ||
    url.hash
  ) {
    return undefined;
  }
  const response = await fetchWithRetry(url.href);
  const value = (await response.json()) as CircuitPayload;
  if (
    value.circuitKey !== meeting.circuit_key ||
    !Number.isFinite(value.rotation) ||
    !Array.isArray(value.x) ||
    !Array.isArray(value.y) ||
    value.x.length < 3 ||
    value.x.length !== value.y.length
  ) {
    return undefined;
  }
  const points = value.x.map((x, index) => [x, value.y?.[index]]).filter(
    (point): point is [number, number] =>
      typeof point[0] === "number" &&
      Number.isFinite(point[0]) &&
      typeof point[1] === "number" &&
      Number.isFinite(point[1]),
  );
  return points.length === value.x.length
    ? { points, rotation: value.rotation as number, source: "circuit" }
    : undefined;
};

const addGeometry = async (replay: ReplaySessionData) => {
  if (replay.trackGeometry?.source === "circuit") {
    replay.trackGeometry = buildTrackGeometry(replay);
    return;
  }
  let candidate = replay.trackGeometry;
  try {
    candidate = (await canonicalGeometry(replay.meeting)) ?? candidate;
  } catch (error) {
    console.warn(`Canonical geometry failed for ${replay.session.session_key}: ${String(error)}`);
  }
  replay.trackGeometry = candidate;
  replay.trackGeometry = buildTrackGeometry(replay);
};

const omittedTimedSamples = (replay: ReplaySessionData) =>
  [replay.teamRadios, replay.overtakes, replay.weather, replay.raceControl, replay.pits]
    .flat()
    .filter((sample) => !Number.isFinite(sample.timestampMs)).length +
  Object.values(replay.telemetryByDriver).reduce(
    (total, telemetry) =>
      total +
      [...telemetry.positions, ...telemetry.laps].filter(
        (sample) => !Number.isFinite(sample.timestampMs),
      ).length,
    0,
  );

const archiveOne = async (
  replay: ReplaySessionData,
  round: number,
  car: CarTelemetryPayload | undefined,
  upload: Upload,
  reuse?: ArchiveManifest,
) => {
  let archive: BuiltArchive;
  try {
    await addGeometry(replay);
    const omitted = omittedTimedSamples(replay);
    if (omitted) {
      console.warn(`Omitted ${omitted} untimed samples from session_key=${replay.session.session_key}`);
    }
    archive = await buildSessionArchive(replay, { round, car });
    validateBuiltArchive(archive);
    if (
      reuse &&
      (JSON.stringify(reuse.locations) !== JSON.stringify(archive.manifest.locations) ||
        JSON.stringify(reuse.car) !== JSON.stringify(archive.manifest.car))
    ) {
      throw new Error("existing chunk descriptors changed during core repair");
    }
  } catch (error) {
    throw new LegacyDataError(
      `replay ${replay.session.session_key} failed archive validation: ${String(error)}`,
    );
  }
  await publishArchiveObjects(archive, upload, reuse);
  return archive.catalog.sessions[0];
};

const importLegacy = async (
  directory: string,
  existing: ArchiveCatalog,
  upload: Upload,
  additions: ArchiveCatalogSession[],
  quarantined: QuarantinedLegacyObject[],
  repairSessionKeys: ReadonlySet<number>,
) => {
  const replayFiles = await firstImportFiles(directory, ["raw/replay", "gzip/replay", "replay"]);
  const carFiles = new Map(
    (
      await firstImportFiles(directory, ["raw/car-telemetry", "gzip/car-telemetry", "car"])
    ).map((path) => [fileSessionKey(path), path]),
  );
  const calendars = new Map<number, JolpicaRace[]>();
  for (const replayPath of replayFiles) {
    const key = fileSessionKey(replayPath);
    let replay: ReplaySessionData;
    try {
      replay = decodeLegacyReplay(await readJsonFile<unknown>(replayPath), key);
    } catch (error) {
      if (!(error instanceof LegacyDataError) && !(error instanceof SyntaxError)) throw error;
      quarantined.push({ kind: "replay", key, reason: String(error) });
      continue;
    }
    let races = calendars.get(replay.session.year);
    if (!races) {
      races = await loadCalendar(replay.session.year);
      calendars.set(replay.session.year, races);
    }
    let round: number;
    try {
      round = officialRound(replay.meeting, races);
    } catch (error) {
      quarantined.push({ kind: "replay", key, reason: String(error) });
      continue;
    }
    const identity = `${replay.session.year}/${round}/${archiveSessionType(replay.session)}`;
    const previous = existing.sessions.find((session) => sessionId(session) === identity);
    if ((previous || additions.some((session) => sessionId(session) === identity)) && !repairSessionKeys.has(key)) {
      continue;
    }
    let reuse: ArchiveManifest | undefined;
    if (previous && repairSessionKeys.has(key)) {
      reuse = await loadManifest(`${DATA_URL}catalog.json`, previous, { retries: 4 });
      replay.trackGeometry = await loadArchivedTrackGeometry(`${DATA_URL}catalog.json`, reuse, {
        retries: 4,
      });
    }
    const carPath = carFiles.get(replay.session.session_key);
    let car: CarTelemetryPayload | undefined;
    if (carPath) {
      try {
        car = decodeLegacyCar(await readJsonFile<unknown>(carPath), replay.session.session_key);
      } catch (error) {
        if (!(error instanceof LegacyDataError) && !(error instanceof SyntaxError)) throw error;
        quarantined.push({ kind: "car", key: replay.session.session_key, reason: String(error) });
      }
    }
    try {
      additions.push(await archiveOne(replay, round, car, upload, reuse));
    } catch (error) {
      if (!(error instanceof LegacyDataError)) throw error;
      quarantined.push({ kind: "replay", key, reason: String(error) });
      continue;
    }
    console.log(`Imported ${identity} session_key=${replay.session.session_key}`);
  }
};

const invalidCoreSessionKeys = async (catalog: ArchiveCatalog) => {
  const keys = new Set<number>();
  for (let index = 0; index < catalog.sessions.length; index += 8) {
    await Promise.all(
      catalog.sessions.slice(index, index + 8).map(async (session) => {
        try {
          const manifest = await loadManifest(`${DATA_URL}catalog.json`, session, { retries: 4 });
          await loadReplayCore(`${DATA_URL}catalog.json`, manifest, { retries: 4 });
        } catch (error) {
          if (!(error instanceof Error) || !error.message.startsWith("Invalid archive:")) throw error;
          keys.add(session.sessionKey);
        }
      }),
    );
  }
  console.log(`Found ${keys.size} invalid archive cores to repair`);
  return keys;
};

const discover = async (
  years: number[],
  existing: ArchiveCatalog,
  upload: Upload,
  additions: ArchiveCatalogSession[],
  maxSessions: number,
) => {
  const openf1 = createOpenF1();
  const now = Date.now();
  let attempted = 0;
  let failed = 0;
  type Meeting = OpenF1Meeting & { is_cancelled?: boolean };
  type Session = OpenF1Session & { is_cancelled?: boolean };
  const candidates: Array<{
    meeting: Meeting;
    session: Session;
    round: number;
    identity: string;
    previous?: ArchiveCatalogSession;
  }> = [];
  const candidateIdentities = new Set<string>();
  for (const year of years) {
    const [meetings, sessions, races] = await Promise.all([
      openf1.fetchOpenF1<Meeting[]>("meetings", { year }),
      openf1.fetchOpenF1<Session[]>("sessions", { year }),
      loadCalendar(year),
    ]);
    for (const meeting of meetings) {
      if (meeting.is_cancelled) continue;
      if (/pre[- ]season/i.test(`${meeting.meeting_name} ${meeting.meeting_official_name}`)) continue;
      const meetingSessions = sessions
        .filter((session) => session.meeting_key === meeting.meeting_key)
        .filter((session) => {
          const end = Date.parse(session.date_end);
          return (
            !session.is_cancelled &&
            archiveSessionType(session) !== undefined &&
            Number.isFinite(end) &&
            end <= now
          );
        })
        .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
      if (!meetingSessions.length) continue;
      let round: number;
      try {
        round = officialRound(meeting, races);
      } catch (error) {
        console.error(
          `Skipped meeting_key=${meeting.meeting_key}; official round unavailable: ${String(error)}`,
        );
        continue;
      }
      for (const session of meetingSessions) {
        const type = archiveSessionType(session);
        if (!type) continue;
        const identity = `${year}/${round}/${type}`;
        if (
          candidateIdentities.has(identity) ||
          additions.some((item) => sessionId(item) === identity)
        ) {
          continue;
        }
        const previous = existing.sessions.find((item) => sessionId(item) === identity);
        if (previous?.status.car === "ready") continue;
        candidateIdentities.add(identity);
        candidates.push({ meeting, session, round, identity, previous });
      }
    }
  }
  candidates.sort(
    (a, b) =>
      Number(Boolean(a.previous)) - Number(Boolean(b.previous)) ||
      Date.parse(b.session.date_end) - Date.parse(a.session.date_end),
  );

  for (const { meeting, session, round, identity, previous } of candidates.slice(0, maxSessions)) {
    const controller = new AbortController();
    const sessionOpenF1 = createOpenF1(OPENF1_URL, 2_000, controller.signal, openf1.pace);
    if (previous) {
      try {
        const car = await buildCarTelemetryPayload(
          session,
          { appendLog: console.log, fetchChunked: sessionOpenF1.fetchChunked },
          { carDataWindowMs: 600_000 },
        );
        const replay = (
          await loadReplaySession(`${DATA_URL}catalog.json`, previous, {
            retries: 4,
            signal: AbortSignal.timeout(120_000),
          })
        ).data;
        additions.push(await archiveOne(replay, round, car, upload));
        console.log(`Repaired car telemetry for ${identity} session_key=${session.session_key}`);
      } catch (error) {
        if (error instanceof OpenF1AuthError) throw error;
        console.error(`Car telemetry remains unavailable for ${identity}: ${String(error)}`);
      } finally {
        controller.abort();
      }
      continue;
    }

    attempted += 1;
    try {
      const replay = await buildReplayPayload(
        meeting,
        session,
        { appendLog: console.log, ...sessionOpenF1 },
        { locationWindowMs: 180_000, positionWindowMs: 600_000, positionOffsetMs: 3_600_000 },
      );
      let car: CarTelemetryPayload | undefined;
      let carError: unknown;
      try {
        car = await buildCarTelemetryPayload(
          session,
          { appendLog: console.log, fetchChunked: sessionOpenF1.fetchChunked },
          { carDataWindowMs: 600_000 },
        );
      } catch (error) {
        carError = error;
        console.error(`Car telemetry unavailable for ${identity}: ${String(error)}`);
      }
      additions.push(await archiveOne(replay, round, car, upload));
      console.log(`Built ${identity} session_key=${session.session_key}`);
      if (carError instanceof OpenF1AuthError) throw carError;
    } catch (error) {
      if (error instanceof OpenF1AuthError) throw error;
      failed += 1;
      console.error(`Skipped ${identity}: ${String(error)}`);
    } finally {
      controller.abort();
    }
  }
  return { attempted, failed };
};

const verifyPublicCatalog = async (catalog: ArchiveCatalog) => {
  const response = await fetch(`${DATA_URL}catalog.json?published=${Date.now()}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: fetchSignal(),
  });
  if (!response.ok) throw new Error(`Published catalog unavailable: ${response.status}`);
  if (response.headers.get("content-encoding") !== "gzip") {
    throw new Error("Published catalog is missing gzip Content-Encoding");
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("Published catalog is missing JSON Content-Type");
  }
  if (!response.headers.get("cache-control")?.includes("max-age=300")) {
    throw new Error("Published catalog has invalid Cache-Control");
  }
  const actual = validateCatalog(await response.json());
  if (JSON.stringify(actual) !== JSON.stringify(catalog)) throw new Error("Published catalog mismatch");
};

const main = async () => {
  const args = parsePublisherArgs(process.argv.slice(2));
  if (args.out && !args.dryRun) throw new Error("--out requires --dry-run");
  if (args.repairInvalidCores && !args.importDir) {
    throw new Error("--repair-invalid-cores requires --import-dir");
  }
  const existing = await loadExistingCatalog(args);
  const additions: ArchiveCatalogSession[] = [];
  const quarantined: QuarantinedLegacyObject[] = [];
  let upload: Upload;
  if (args.dryRun) {
    upload = localUpload(args.out);
  } else {
    const bucket = createR2Client();
    await preflightR2(bucket, Boolean(args.catalog));
    upload = r2Upload(bucket);
  }
  const repairSessionKeys = args.repairInvalidCores
    ? await invalidCoreSessionKeys(existing)
    : new Set<number>();

  let failure: unknown;
  try {
    if (args.importDir) {
      await importLegacy(
        args.importDir,
        existing,
        upload,
        additions,
        quarantined,
        repairSessionKeys,
      );
    }
  } catch (error) {
    failure = error;
  }
  if (args.importDir) {
    await mkdir(dirname(args.quarantine), { recursive: true });
    await Bun.write(
      args.quarantine,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), skipped: quarantined }, null, 2)}\n`,
    );
    if (quarantined.length) {
      console.error(JSON.stringify({ quarantine: args.quarantine, skipped: quarantined }));
    }
  }
  let denied = false;
  let attempted = 0;
  let failedAttempts = 0;
  if (!failure && !args.importOnly) {
    try {
      const result = await discover(args.years, existing, upload, additions, args.maxSessions);
      attempted = result.attempted;
      failedAttempts = result.failed;
      if (attempted > 0 && failedAttempts === attempted && additions.length === 0) {
        failure = new Error(`All ${attempted} replay build attempts failed`);
      }
    } catch (error) {
      if (error instanceof OpenF1AuthError) {
        denied = true;
        console.warn("OpenF1 returned 401; preserving the last good catalog");
      } else failure = error;
    }
  }

  const catalog = (denied || failure) && !additions.length
    ? existing
    : mergeCatalog(existing, additions, new Date().toISOString());
  await mkdir(dirname(args.snapshot), { recursive: true });
  await Bun.write(args.snapshot, `${JSON.stringify(catalog, null, 2)}\n`);
  if (additions.length) {
    await publishCatalog(catalog, upload);
    if (!args.dryRun) await verifyPublicCatalog(catalog);
  }
  console.log(
    JSON.stringify({
      dryRun: args.dryRun,
      added: additions.length,
      attempted,
      failedAttempts,
      sessions: catalog.sessions.length,
      denied,
      failed: Boolean(failure),
      skipped: quarantined.length,
      snapshot: args.snapshot,
    }),
  );
  if (failure) throw failure;
};

if (import.meta.main) await main();
