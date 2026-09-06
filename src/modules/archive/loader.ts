import type { CarTelemetryPayload } from "../replay/types/carTelemetry.types";
import type { ReplaySessionData } from "../replay/types/openf1.types";
import { appendLocations, decodeCarChunk, decodeCore, decodeLocationChunk } from "./codec";
import { getBundledCatalogUrl } from "./config";
import {
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveCarChunk,
  type ArchiveCatalog,
  type ArchiveCatalogSession,
  type ArchiveChunk,
  type ArchiveCore,
  type ArchiveLoadOptions,
  type ArchiveLocationChunk,
  type ArchiveManifest,
  type ArchiveObject,
  archiveSessionType,
  type BuiltArchive,
  type CatalogLoadOptions,
  type DecodedLocationChunk,
} from "./types";

const MAX_CATALOG_BYTES = 2_000_000;
const MAX_MANIFEST_BYTES = 1_000_000;
const MAX_CORE_BYTES = 12_000_000;
const MAX_CHUNK_BYTES = 12_000_000;
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

const fail = (message: string): never => {
  throw new Error(`Invalid archive: ${message}`);
};

const record = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${name} must be an object`);
  return value as Record<string, unknown>;
};

const finite = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${name} must be finite`);
  return value as number;
};

const positiveInteger = (value: unknown, name: string): number => {
  const number = finite(value, name);
  if (!Number.isInteger(number) || number < 1) fail(`${name} must be a positive integer`);
  return number;
};

const string = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value) fail(`${name} must be a string`);
  return value as string;
};

const array = (value: unknown, name: string): unknown[] => {
  if (!Array.isArray(value)) fail(`${name} must be an array`);
  return value as unknown[];
};

const validateObject = (value: unknown, name: string, maxBytes: number): ArchiveObject => {
  const object = record(value, name);
  const url = string(object.url, `${name}.url`);
  const sha256 = string(object.sha256, `${name}.sha256`);
  const match = /^objects\/([a-f0-9]{64})\.json$/.exec(url);
  if (!match || match[1] !== sha256) fail(`${name}.url must match its SHA-256`);
  const bytes = positiveInteger(object.bytes, `${name}.bytes`);
  if (bytes > maxBytes) fail(`${name} exceeds ${maxBytes} bytes`);
  return object as ArchiveObject;
};

const validateChunks = (value: unknown, name: string): ArchiveChunk[] => {
  const chunks = array(value, name).map((item, index) => {
    const chunk = record(item, `${name}[${index}]`);
    const object = validateObject(chunk, `${name}[${index}]`, MAX_CHUNK_BYTES);
    const startMs = finite(chunk.startMs, `${name}[${index}].startMs`);
    const endMs = finite(chunk.endMs, `${name}[${index}].endMs`);
    if (endMs <= startMs) fail(`${name}[${index}] has an empty range`);
    positiveInteger(chunk.samples, `${name}[${index}].samples`);
    return { ...object, startMs, endMs, samples: chunk.samples as number };
  });
  for (let index = 1; index < chunks.length; index += 1) {
    if (chunks[index].startMs < chunks[index - 1].endMs) fail(`${name} must be ordered`);
  }
  return chunks;
};

const validateCatalogSession = (value: unknown, index: number): ArchiveCatalogSession => {
  const name = `catalog.sessions[${index}]`;
  const session = record(value, name);
  const year = positiveInteger(session.year, `${name}.year`);
  const round = positiveInteger(session.round, `${name}.round`);
  const sessionKey = positiveInteger(session.sessionKey, `${name}.sessionKey`);
  const meetingKey = positiveInteger(session.meetingKey, `${name}.meetingKey`);
  const meeting = record(session.meeting, `${name}.meeting`);
  const metadata = record(session.session, `${name}.session`);
  if (meeting.meeting_key !== meetingKey || metadata.meeting_key !== meetingKey) {
    fail(`${name} meeting key mismatch`);
  }
  if (metadata.session_key !== sessionKey || metadata.year !== year)
    fail(`${name} session mismatch`);
  const status = record(session.status, `${name}.status`);
  if (status.replay !== "ready" || (status.car !== "ready" && status.car !== "unavailable")) {
    fail(`${name}.status is unsupported`);
  }
  const type =
    archiveSessionType(metadata as ArchiveCatalogSession["session"]) ??
    fail(`${name}.session name is unsupported`);
  if (session.type !== type) fail(`${name}.type does not match session name`);
  return {
    year,
    round,
    sessionKey,
    meetingKey,
    type,
    meeting: meeting as ArchiveCatalogSession["meeting"],
    session: metadata as ArchiveCatalogSession["session"],
    status: status as ArchiveCatalogSession["status"],
    manifest: validateObject(session.manifest, `${name}.manifest`, MAX_MANIFEST_BYTES),
  };
};

export const validateCatalog = (value: unknown): ArchiveCatalog => {
  const catalog = record(value, "catalog");
  if (catalog.schemaVersion !== ARCHIVE_SCHEMA_VERSION) fail("unsupported catalog schema");
  string(catalog.updatedAt, "catalog.updatedAt");
  const sessions = array(catalog.sessions, "catalog.sessions").map(validateCatalogSession);
  const identities = new Set<string>();
  for (const session of sessions) {
    const identity = `${session.year}/${session.round}/${session.type}`;
    if (identities.has(identity)) fail(`duplicate session ${identity}`);
    identities.add(identity);
  }
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    updatedAt: catalog.updatedAt as string,
    sessions,
  };
};

export const validateManifest = (
  value: unknown,
  catalogSession?: ArchiveCatalogSession,
): ArchiveManifest => {
  const manifest = record(value, "manifest");
  if (manifest.schemaVersion !== ARCHIVE_SCHEMA_VERSION) fail("unsupported manifest schema");
  const sessionKey = positiveInteger(manifest.sessionKey, "manifest.sessionKey");
  const meetingKey = positiveInteger(manifest.meetingKey, "manifest.meetingKey");
  const year = positiveInteger(manifest.year, "manifest.year");
  const round = positiveInteger(manifest.round, "manifest.round");
  const sessionStartMs = finite(manifest.sessionStartMs, "manifest.sessionStartMs");
  const sessionEndMs = finite(manifest.sessionEndMs, "manifest.sessionEndMs");
  if (sessionEndMs <= sessionStartMs) fail("manifest session range is empty");
  if (
    catalogSession &&
    (catalogSession.sessionKey !== sessionKey ||
      catalogSession.meetingKey !== meetingKey ||
      catalogSession.year !== year ||
      catalogSession.round !== round)
  ) {
    fail("manifest does not match catalog");
  }
  const locations = validateChunks(manifest.locations, "manifest.locations");
  let car: ArchiveManifest["car"];
  if (manifest.car !== undefined) {
    const source = record(manifest.car, "manifest.car");
    if (source.sampleIntervalMs !== 500) fail("manifest.car.sampleIntervalMs must be 500");
    car = {
      sampleIntervalMs: 500,
      createdAt: string(source.createdAt, "manifest.car.createdAt"),
      chunks: validateChunks(source.chunks, "manifest.car.chunks"),
    };
  }
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    year,
    round,
    sessionKey,
    meetingKey,
    sessionStartMs,
    sessionEndMs,
    core: validateObject(manifest.core, "manifest.core", MAX_CORE_BYTES),
    locations,
    ...(car ? { car } : {}),
  };
};

const validateSamples = (
  value: unknown,
  name: string,
  manifest: ArchiveManifest,
  driver?: number,
  timestamps = true,
) => {
  let previous = Number.NEGATIVE_INFINITY;
  for (const [index, item] of array(value, name).entries()) {
    const sample = record(item, `${name}[${index}]`);
    if (sample.session_key !== undefined && sample.session_key !== manifest.sessionKey) {
      fail(`${name}[${index}] session key mismatch`);
    }
    if (sample.meeting_key !== undefined && sample.meeting_key !== manifest.meetingKey) {
      fail(`${name}[${index}] meeting key mismatch`);
    }
    if (driver !== undefined && sample.driver_number !== driver) {
      fail(`${name}[${index}] driver mismatch`);
    }
    if (timestamps) {
      const timestamp = finite(sample.timestampMs, `${name}[${index}].timestampMs`);
      if (timestamp < previous) fail(`${name} must be sorted`);
      previous = timestamp;
    }
  }
};

const validateTrackGeometry = (value: unknown) => {
  const geometry = record(value, "core.payload.trackGeometry");
  finite(geometry.rotation, "core.payload.trackGeometry.rotation");
  if (geometry.source !== "circuit" && geometry.source !== "lap") {
    fail("core.payload.trackGeometry.source is invalid");
  }
  for (const field of ["points", "pitLane"] as const) {
    if (field === "pitLane" && geometry[field] === undefined) continue;
    const points = array(geometry[field], `core.payload.trackGeometry.${field}`);
    if (points.length < 3) fail(`core.payload.trackGeometry.${field} needs at least three points`);
    if (field === "pitLane" && points.length > 2048)
      fail("core.payload.trackGeometry.pitLane is too large");
    for (const [index, value] of points.entries()) {
      const point = array(value, `core.payload.trackGeometry.${field}[${index}]`);
      if (
        point.length !== 2 ||
        point.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate))
      ) {
        fail(`core.payload.trackGeometry.${field}[${index}] is invalid`);
      }
    }
  }
  return geometry as unknown as NonNullable<ReplaySessionData["trackGeometry"]>;
};

export const validateCore = (value: unknown, manifest: ArchiveManifest): ArchiveCore => {
  const core = record(value, "core");
  if (core.schemaVersion !== ARCHIVE_SCHEMA_VERSION || core.sessionKey !== manifest.sessionKey) {
    fail("core session or schema mismatch");
  }
  const payload = record(core.payload, "core.payload");
  const session = record(payload.session, "core.payload.session");
  const meeting = record(payload.meeting, "core.payload.meeting");
  if (session.session_key !== manifest.sessionKey || meeting.meeting_key !== manifest.meetingKey) {
    fail("core metadata key mismatch");
  }
  if (
    payload.sessionStartMs !== manifest.sessionStartMs ||
    payload.sessionEndMs !== manifest.sessionEndMs
  ) {
    fail("core session range mismatch");
  }
  if (payload.trackGeometry !== undefined) validateTrackGeometry(payload.trackGeometry);
  validateSamples(payload.drivers, "core.payload.drivers", manifest, undefined, false);
  for (const name of ["teamRadios", "overtakes", "weather", "raceControl", "pits"]) {
    validateSamples(payload[name], `core.payload.${name}`, manifest);
  }
  for (const [driver, telemetryValue] of Object.entries(
    record(payload.telemetryByDriver, "core.payload.telemetryByDriver"),
  )) {
    positiveInteger(Number(driver), `core driver ${driver}`);
    const telemetry = record(telemetryValue, `core driver ${driver}`);
    if ("locations" in telemetry) fail(`core driver ${driver} must not contain locations`);
    validateSamples(
      telemetry.stints,
      `core driver ${driver}.stints`,
      manifest,
      Number(driver),
      false,
    );
    validateSamples(
      telemetry.positions,
      `core driver ${driver}.positions`,
      manifest,
      Number(driver),
    );
    validateSamples(telemetry.laps, `core driver ${driver}.laps`, manifest, Number(driver));
  }
  return core as ArchiveCore;
};

export const loadArchivedTrackGeometry = async (
  catalogUrl: string,
  manifest: ArchiveManifest,
  options: ArchiveLoadOptions = {},
) => {
  const core = record(
    await fetchObject(catalogUrl, manifest.core, MAX_CORE_BYTES, options),
    "core",
  );
  if (core.schemaVersion !== ARCHIVE_SCHEMA_VERSION || core.sessionKey !== manifest.sessionKey) {
    fail("core session or schema mismatch");
  }
  const payload = record(core.payload, "core.payload");
  const session = record(payload.session, "core.payload.session");
  const meeting = record(payload.meeting, "core.payload.meeting");
  if (session.session_key !== manifest.sessionKey || meeting.meeting_key !== manifest.meetingKey) {
    fail("core metadata key mismatch");
  }
  return payload.trackGeometry === undefined
    ? undefined
    : validateTrackGeometry(payload.trackGeometry);
};

const validateTupleChunk = <T extends ArchiveLocationChunk | ArchiveCarChunk>(
  value: unknown,
  descriptor: ArchiveChunk,
  manifest: ArchiveManifest,
  tupleLength: number,
  knownDrivers?: ReadonlySet<number>,
): T => {
  const chunk = record(value, "chunk");
  if (chunk.schemaVersion !== ARCHIVE_SCHEMA_VERSION || chunk.sessionKey !== manifest.sessionKey) {
    fail("chunk session or schema mismatch");
  }
  if (chunk.startMs !== descriptor.startMs || chunk.endMs !== descriptor.endMs) {
    fail("chunk range mismatch");
  }
  const samples = array(chunk.samples, "chunk.samples");
  if (samples.length !== descriptor.samples) fail("chunk sample count mismatch");
  let previous = Number.NEGATIVE_INFINITY;
  for (const [index, tupleValue] of samples.entries()) {
    const tuple = array(tupleValue, `chunk.samples[${index}]`);
    if (
      tuple.length !== tupleLength ||
      tuple.some((item) => typeof item !== "number" || !Number.isFinite(item))
    ) {
      fail(`chunk.samples[${index}] is invalid`);
    }
    const timestampMs = manifest.sessionStartMs + (tuple[0] as number);
    if (
      timestampMs < descriptor.startMs ||
      timestampMs > descriptor.endMs ||
      timestampMs < previous
    ) {
      fail(`chunk.samples[${index}] timestamp is invalid`);
    }
    const driver = positiveInteger(tuple[1], `chunk.samples[${index}] driver`);
    if (knownDrivers && !knownDrivers.has(driver)) {
      fail(`chunk.samples[${index}] has unknown driver ${driver}`);
    }
    previous = timestampMs;
  }
  return chunk as T;
};

export const validateLocationArchiveChunk = (
  value: unknown,
  descriptor: ArchiveChunk,
  manifest: ArchiveManifest,
  knownDrivers: ReadonlySet<number>,
) => {
  const chunk = validateTupleChunk<ArchiveLocationChunk>(
    value,
    descriptor,
    manifest,
    5,
    knownDrivers,
  );
  const source = record(value, "chunk");
  const guards = array(source.guards, "chunk.guards");
  const seen = new Set<string>();
  let previous = Number.NEGATIVE_INFINITY;
  for (const [index, tupleValue] of guards.entries()) {
    const tuple = array(tupleValue, `chunk.guards[${index}]`);
    if (
      tuple.length !== 5 ||
      tuple.some((item) => typeof item !== "number" || !Number.isFinite(item))
    ) {
      fail(`chunk.guards[${index}] is invalid`);
    }
    const timestampMs = manifest.sessionStartMs + (tuple[0] as number);
    const side =
      timestampMs < descriptor.startMs ? "before" : timestampMs >= descriptor.endMs ? "after" : "";
    if (!side || timestampMs < previous) fail(`chunk.guards[${index}] timestamp is invalid`);
    const driver = positiveInteger(tuple[1], `chunk.guards[${index}] driver`);
    if (!knownDrivers.has(driver)) fail(`chunk.guards[${index}] has unknown driver ${driver}`);
    const key = `${driver}/${side}`;
    if (seen.has(key)) fail(`chunk.guards has duplicate ${side} guard for driver ${driver}`);
    seen.add(key);
    previous = timestampMs;
  }
  chunk.guards = guards as ArchiveLocationChunk["guards"];
  return chunk;
};

export const validateCarArchiveChunk = (
  value: unknown,
  descriptor: ArchiveChunk,
  manifest: ArchiveManifest,
  knownDrivers?: ReadonlySet<number>,
) => validateTupleChunk<ArchiveCarChunk>(value, descriptor, manifest, 8, knownDrivers);

export const validateBuiltArchive = (archive: BuiltArchive) => {
  const read = (path: string) => {
    const content = archive.files.get(path) ?? fail(`built archive is missing ${path}`);
    try {
      return JSON.parse(content) as unknown;
    } catch {
      return fail(`built archive ${path} is not JSON`);
    }
  };
  const catalog = validateCatalog(archive.catalog);
  const fileCatalog = validateCatalog(read("catalog.json"));
  if (JSON.stringify(catalog) !== JSON.stringify(fileCatalog)) fail("built catalog mismatch");
  const session = catalog.sessions[0] ?? fail("built archive has no session");
  if (catalog.sessions.length !== 1) fail("built archive must contain one session");
  const manifest = validateManifest(archive.manifest, session);
  const fileManifest = validateManifest(read(session.manifest.url), session);
  if (JSON.stringify(manifest) !== JSON.stringify(fileManifest)) fail("built manifest mismatch");
  const core = validateCore(read(manifest.core.url), manifest);
  const knownDrivers = new Set(Object.keys(core.payload.telemetryByDriver).map(Number));
  for (const descriptor of manifest.locations) {
    validateLocationArchiveChunk(read(descriptor.url), descriptor, manifest, knownDrivers);
  }
  for (const descriptor of manifest.car?.chunks ?? []) {
    validateCarArchiveChunk(read(descriptor.url), descriptor, manifest);
  }
};

const resolveObjectUrl = (catalogUrl: string, object: ArchiveObject) => {
  const catalog = new URL(catalogUrl);
  if (
    (catalog.protocol !== "https:" && catalog.protocol !== "http:") ||
    catalog.username ||
    catalog.password
  ) {
    fail("catalog URL must be HTTP(S) without credentials");
  }
  const resolved = new URL(object.url, catalog);
  if (resolved.origin !== catalog.origin) fail("object URL changed origin");
  return resolved.href;
};

const abortError = () => new DOMException("The operation was aborted", "AbortError");

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });

const readResponseBytes = async (response: Response, maxBytes: number) => {
  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        fail("response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
};

const fetchBytes = async (url: string, maxBytes: number, options: ArchiveLoadOptions) => {
  const retries = options.retries ?? 2;
  if (!Number.isInteger(retries) || retries < 0 || retries > 4)
    throw new Error("retries must be 0 to 4");
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { signal });
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        fail("response is too large");
      }
      if (!response.ok) {
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= retries)
          throw new Error(`Archive request failed: ${response.status}`);
        await pause(150 * 2 ** attempt, signal);
        continue;
      }
      return await readResponseBytes(response, maxBytes);
    } catch (error) {
      if (signal.aborted) throw error;
      if (
        attempt >= retries ||
        (error instanceof Error &&
          (error.message.startsWith("Invalid archive:") ||
            error.message.startsWith("Archive request failed:")))
      ) {
        throw error;
      }
      await pause(150 * 2 ** attempt, signal);
    }
  }
};

const parseJson = (bytes: ArrayBuffer) => JSON.parse(new TextDecoder().decode(bytes)) as unknown;

const fetchJson = async (url: string, maxBytes: number, options: ArchiveLoadOptions) =>
  parseJson(await fetchBytes(url, maxBytes, options));

const fetchObject = async (
  catalogUrl: string,
  object: ArchiveObject,
  maxBytes: number,
  options: ArchiveLoadOptions,
) => {
  const bytes = await fetchBytes(resolveObjectUrl(catalogUrl, object), maxBytes, options);
  if (bytes.byteLength !== object.bytes) fail("object byte size mismatch");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== object.sha256) fail("object hash mismatch");
  return parseJson(bytes);
};

export const loadCatalog = async (
  catalogUrl: string,
  options: CatalogLoadOptions = {},
): Promise<ArchiveCatalog> => {
  const storage =
    options.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const cacheKey = `f1-archive-catalog:${catalogUrl}`;
  try {
    const catalog = validateCatalog(await fetchJson(catalogUrl, MAX_CATALOG_BYTES, options));
    try {
      if (!options.networkOnly) {
        storage?.setItem(cacheKey, JSON.stringify({ storedAt: Date.now(), catalog }));
      }
    } catch {}
    return catalog;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (!options.networkOnly) {
      try {
        const cached = record(JSON.parse(storage?.getItem(cacheKey) ?? "null"), "catalog cache");
        const storedAt = finite(cached.storedAt, "catalog cache timestamp");
        if (Date.now() - storedAt <= (options.ttlMs ?? DEFAULT_CATALOG_TTL_MS)) {
          return validateCatalog(cached.catalog);
        }
      } catch {}
      const bundledUrl = getBundledCatalogUrl(catalogUrl);
      if (bundledUrl) {
        try {
          return validateCatalog(await fetchJson(bundledUrl, MAX_CATALOG_BYTES, options));
        } catch (fallbackError) {
          if (options.signal?.aborted) throw fallbackError;
        }
      }
    }
    throw error;
  }
};

export const loadManifest = async (
  catalogUrl: string,
  session: ArchiveCatalogSession,
  options: ArchiveLoadOptions = {},
) =>
  validateManifest(
    await fetchObject(catalogUrl, session.manifest, MAX_MANIFEST_BYTES, options),
    session,
  );

export const loadReplayCore = async (
  catalogUrl: string,
  manifest: ArchiveManifest,
  options: ArchiveLoadOptions = {},
): Promise<ReplaySessionData> =>
  decodeCore(
    validateCore(await fetchObject(catalogUrl, manifest.core, MAX_CORE_BYTES, options), manifest),
  );

export const loadLocationChunk = async (
  catalogUrl: string,
  manifest: ArchiveManifest,
  descriptor: ArchiveChunk,
  knownDrivers: ReadonlySet<number>,
  options: ArchiveLoadOptions = {},
): Promise<DecodedLocationChunk> =>
  decodeLocationChunk(
    validateLocationArchiveChunk(
      await fetchObject(catalogUrl, descriptor, MAX_CHUNK_BYTES, options),
      descriptor,
      manifest,
      knownDrivers,
    ),
    manifest,
  );

export const loadCarChunk = async (
  catalogUrl: string,
  manifest: ArchiveManifest,
  descriptor: ArchiveChunk,
  options: ArchiveLoadOptions = {},
): Promise<CarTelemetryPayload["byDriver"]> =>
  decodeCarChunk(
    validateCarArchiveChunk(
      await fetchObject(catalogUrl, descriptor, MAX_CHUNK_BYTES, options),
      descriptor,
      manifest,
    ),
    manifest,
  );

export const findChunkAt = (chunks: ArchiveChunk[], timestampMs: number) =>
  chunks.find(
    (chunk, index) =>
      timestampMs >= chunk.startMs &&
      (timestampMs < chunk.endMs || (index === chunks.length - 1 && timestampMs === chunk.endMs)),
  );

export const loadReplaySession = async (
  catalogUrl: string,
  session: ArchiveCatalogSession,
  options: ArchiveLoadOptions = {},
) => {
  const manifest = await loadManifest(catalogUrl, session, options);
  const data = await loadReplayCore(catalogUrl, manifest, options);
  const knownDrivers = new Set(Object.keys(data.telemetryByDriver).map(Number));
  for (const chunk of manifest.locations) {
    const encoded = validateLocationArchiveChunk(
      await fetchObject(catalogUrl, chunk, MAX_CHUNK_BYTES, options),
      chunk,
      manifest,
      knownDrivers,
    );
    appendLocations(data, decodeLocationChunk(encoded, manifest, false));
  }

  let car: CarTelemetryPayload | undefined;
  if (manifest.car) {
    const byDriver: CarTelemetryPayload["byDriver"] = {};
    for (const chunk of manifest.car.chunks) {
      for (const [driver, samples] of Object.entries(
        await loadCarChunk(catalogUrl, manifest, chunk, options),
      )) {
        const driverSamples = byDriver[Number(driver)] ?? [];
        driverSamples.push(...samples);
        byDriver[Number(driver)] = driverSamples;
      }
    }
    car = {
      sessionKey: manifest.sessionKey,
      sampleIntervalMs: manifest.car.sampleIntervalMs,
      createdAt: manifest.car.createdAt,
      byDriver,
    };
  }
  return { manifest, data, car };
};
