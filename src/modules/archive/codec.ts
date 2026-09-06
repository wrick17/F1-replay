import type { CarTelemetryPayload } from "../replay/types/carTelemetry.types";
import type { OpenF1Location, ReplaySessionData, TimedSample } from "../replay/types/openf1.types";
import {
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveCarChunk,
  type ArchiveCore,
  type ArchiveLocationChunk,
  type ArchiveManifest,
  type ArchiveObject,
  archiveSessionType,
  type BuildArchiveOptions,
  type BuiltArchive,
  type CarTuple,
  type DecodedLocationChunk,
  type LocationTuple,
} from "./types";

const FIRST_CHUNK_MS = 60_000;
const DEFAULT_CHUNK_MS = 240_000;

const sha256 = async (content: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const addObject = async (files: Map<string, string>, value: unknown): Promise<ArchiveObject> => {
  const content = JSON.stringify(value);
  const hash = await sha256(content);
  const url = `objects/${hash}.json`;
  files.set(url, content);
  return { url, sha256: hash, bytes: new TextEncoder().encode(content).byteLength };
};

const chunkStart = (relativeMs: number, chunkMs: number) =>
  relativeMs < FIRST_CHUNK_MS
    ? 0
    : FIRST_CHUNK_MS + Math.floor((relativeMs - FIRST_CHUNK_MS) / chunkMs) * chunkMs;

const splitTuples = <T extends [number, ...number[]]>(
  tuples: T[],
  sessionStartMs: number,
  sessionEndMs: number,
  chunkMs: number,
) => {
  const chunks = new Map<number, T[]>();
  for (const tuple of tuples) {
    const start = chunkStart(tuple[0], chunkMs);
    const chunk = chunks.get(start);
    if (chunk) chunk.push(tuple);
    else chunks.set(start, [tuple]);
  }
  return [...chunks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, samples]) => ({
      startMs: sessionStartMs + start,
      endMs: Math.min(
        sessionStartMs + start + (start === 0 ? FIRST_CHUNK_MS : chunkMs),
        sessionEndMs,
      ),
      samples,
    }));
};

const toLocationTuple = (
  sample: TimedSample<OpenF1Location>,
  sessionStartMs: number,
): LocationTuple => [
  sample.timestampMs - sessionStartMs,
  sample.driver_number,
  sample.x,
  sample.y,
  sample.z,
];

const locationTuples = (data: ReplaySessionData): LocationTuple[] =>
  Object.values(data.telemetryByDriver)
    .flatMap((telemetry) =>
      telemetry.locations.map((sample) => toLocationTuple(sample, data.sessionStartMs)),
    )
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const locationGuards = (data: ReplaySessionData, startMs: number, endMs: number) => {
  const guards: LocationTuple[] = [];
  for (const telemetry of Object.values(data.telemetryByDriver)) {
    const samples = telemetry.locations;
    let left = 0;
    let right = samples.length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (samples[middle].timestampMs < startMs) left = middle + 1;
      else right = middle;
    }
    if (left > 0) guards.push(toLocationTuple(samples[left - 1], data.sessionStartMs));

    left = 0;
    right = samples.length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (samples[middle].timestampMs < endMs) left = middle + 1;
      else right = middle;
    }
    if (left < samples.length) guards.push(toLocationTuple(samples[left], data.sessionStartMs));
  }
  return guards.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};

const carTuples = (car: CarTelemetryPayload, sessionStartMs: number): CarTuple[] =>
  Object.entries(car.byDriver)
    .flatMap(([driver, samples]) =>
      samples.map(
        (sample): CarTuple => [
          sample.timestampMs - sessionStartMs,
          Number(driver),
          sample.speed,
          sample.gear,
          sample.rpm,
          sample.throttle,
          sample.brake,
          sample.drs,
        ],
      ),
    )
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const sortedFiniteSamples = <T extends { timestampMs: number }>(samples: T[]) =>
  samples
    .filter((sample) => Number.isFinite(sample.timestampMs))
    .sort((a, b) => a.timestampMs - b.timestampMs);

export const buildSessionArchive = async (
  data: ReplaySessionData,
  options: BuildArchiveOptions,
): Promise<BuiltArchive> => {
  const type = archiveSessionType(data.session);
  if (!type) throw new Error(`unsupported archive session: ${data.session.session_name}`);
  if (!Number.isInteger(options.round) || options.round < 1)
    throw new Error("round must be positive");
  if (data.session.session_key !== options.car?.sessionKey && options.car) {
    throw new Error("car session key does not match replay");
  }
  const chunkMs = options.chunkMs ?? DEFAULT_CHUNK_MS;
  if (chunkMs < 180_000 || chunkMs > 300_000) throw new Error("chunkMs must be 3 to 5 minutes");

  const files = new Map<string, string>();
  const telemetryByDriver = Object.fromEntries(
    Object.entries(data.telemetryByDriver).map(
      ([driver, { locations: _locations, positions, laps, ...telemetry }]) => [
        driver,
        {
          ...telemetry,
          positions: sortedFiniteSamples(positions),
          laps: sortedFiniteSamples(laps),
        },
      ],
    ),
  );
  const core: ArchiveCore = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    sessionKey: data.session.session_key,
    payload: {
      ...data,
      telemetryByDriver,
      teamRadios: sortedFiniteSamples(data.teamRadios),
      overtakes: sortedFiniteSamples(data.overtakes),
      weather: sortedFiniteSamples(data.weather),
      raceControl: sortedFiniteSamples(data.raceControl),
      pits: sortedFiniteSamples(data.pits),
    },
  };
  const coreObject = await addObject(files, core);

  const locations = [];
  for (const chunk of splitTuples(
    locationTuples(data),
    data.sessionStartMs,
    data.sessionEndMs,
    chunkMs,
  )) {
    const value: ArchiveLocationChunk = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      sessionKey: data.session.session_key,
      ...chunk,
      guards: locationGuards(data, chunk.startMs, chunk.endMs),
    };
    locations.push({ ...(await addObject(files, value)), ...chunk, samples: chunk.samples.length });
  }

  let car: ArchiveManifest["car"];
  if (options.car) {
    const chunks = [];
    for (const chunk of splitTuples(
      carTuples(options.car, data.sessionStartMs),
      data.sessionStartMs,
      data.sessionEndMs,
      chunkMs,
    )) {
      const value: ArchiveCarChunk = {
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        sessionKey: data.session.session_key,
        ...chunk,
      };
      chunks.push({ ...(await addObject(files, value)), ...chunk, samples: chunk.samples.length });
    }
    car = {
      sampleIntervalMs: options.car.sampleIntervalMs,
      createdAt: options.car.createdAt,
      chunks,
    };
  }

  const manifest: ArchiveManifest = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    year: data.session.year,
    round: options.round,
    sessionKey: data.session.session_key,
    meetingKey: data.meeting.meeting_key,
    sessionStartMs: data.sessionStartMs,
    sessionEndMs: data.sessionEndMs,
    core: coreObject,
    locations,
    ...(car ? { car } : {}),
  };
  const manifestObject = await addObject(files, manifest);
  const catalog = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    sessions: [
      {
        year: data.session.year,
        round: options.round,
        sessionKey: data.session.session_key,
        meetingKey: data.meeting.meeting_key,
        type,
        meeting: data.meeting,
        session: data.session,
        status: {
          replay: "ready" as const,
          car: car ? ("ready" as const) : ("unavailable" as const),
        },
        manifest: manifestObject,
      },
    ],
  };
  files.set("catalog.json", JSON.stringify(catalog));
  return { catalog, manifest, files };
};

export const decodeCore = (core: ArchiveCore): ReplaySessionData => ({
  ...core.payload,
  telemetryByDriver: Object.fromEntries(
    Object.entries(core.payload.telemetryByDriver).map(([driver, telemetry]) => [
      driver,
      { ...telemetry, locations: [] },
    ]),
  ),
});

export const decodeLocationChunk = (
  chunk: ArchiveLocationChunk,
  manifest: ArchiveManifest,
  includeGuards = true,
): DecodedLocationChunk => {
  const byDriver: DecodedLocationChunk = {};
  const samples = includeGuards
    ? [...chunk.guards, ...chunk.samples].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    : chunk.samples;
  for (const [relativeMs, driver_number, x, y, z] of samples) {
    const timestampMs = manifest.sessionStartMs + relativeMs;
    const driverSamples = byDriver[driver_number] ?? [];
    driverSamples.push({
      date: new Date(timestampMs).toISOString(),
      meeting_key: manifest.meetingKey,
      session_key: manifest.sessionKey,
      driver_number,
      x,
      y,
      z,
      timestampMs,
    } as TimedSample<OpenF1Location>);
    byDriver[driver_number] = driverSamples;
  }
  return byDriver;
};

export const appendLocations = (data: ReplaySessionData, chunk: DecodedLocationChunk) => {
  for (const [driver, samples] of Object.entries(chunk)) {
    const telemetry = data.telemetryByDriver[Number(driver)];
    if (!telemetry) throw new Error(`location chunk has unknown driver ${driver}`);
    telemetry.locations.push(...samples);
  }
};

export const decodeCarChunk = (
  chunk: ArchiveCarChunk,
  manifest: ArchiveManifest,
): CarTelemetryPayload["byDriver"] => {
  const byDriver: CarTelemetryPayload["byDriver"] = {};
  for (const [relativeMs, driver, speed, gear, rpm, throttle, brake, drs] of chunk.samples) {
    const driverSamples = byDriver[driver] ?? [];
    driverSamples.push({
      timestampMs: manifest.sessionStartMs + relativeMs,
      speed,
      gear,
      rpm,
      throttle,
      brake,
      drs,
    });
    byDriver[driver] = driverSamples;
  }
  return byDriver;
};
