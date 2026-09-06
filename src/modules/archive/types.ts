import type { CarTelemetryPayload } from "../replay/types/carTelemetry.types";
import type {
  OpenF1Location,
  ReplaySessionData,
  ReplayTelemetry,
  TimedSample,
} from "../replay/types/openf1.types";

export const ARCHIVE_SCHEMA_VERSION = 2 as const;

export type ArchiveSessionType = "Qualifying" | "Sprint" | "Race";

export const archiveSessionType = (
  session: Pick<ReplaySessionData["session"], "session_name">,
): ArchiveSessionType | undefined => {
  const name = typeof session.session_name === "string" ? session.session_name.trim() : "";
  return name === "Qualifying" || name === "Sprint" || name === "Race" ? name : undefined;
};

export type ArchiveObject = {
  url: string;
  sha256: string;
  bytes: number;
};

export type ArchiveChunk = ArchiveObject & {
  startMs: number;
  endMs: number;
  samples: number;
};

export type ArchiveCatalogSession = {
  year: number;
  round: number;
  sessionKey: number;
  meetingKey: number;
  type: ArchiveSessionType;
  meeting: ReplaySessionData["meeting"];
  session: ReplaySessionData["session"];
  status: {
    replay: "ready";
    car: "ready" | "unavailable";
  };
  manifest: ArchiveObject;
};

export type ArchiveCatalog = {
  schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  updatedAt: string;
  sessions: ArchiveCatalogSession[];
};

export type ArchiveManifest = {
  schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  year: number;
  round: number;
  sessionKey: number;
  meetingKey: number;
  sessionStartMs: number;
  sessionEndMs: number;
  core: ArchiveObject;
  locations: ArchiveChunk[];
  car?: {
    sampleIntervalMs: CarTelemetryPayload["sampleIntervalMs"];
    createdAt: string;
    chunks: ArchiveChunk[];
  };
};

export type ReplayCorePayload = Omit<ReplaySessionData, "telemetryByDriver"> & {
  telemetryByDriver: Record<number, Omit<ReplayTelemetry, "locations">>;
};

export type ArchiveCore = {
  schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  sessionKey: number;
  payload: ReplayCorePayload;
};

export type LocationTuple = [
  relativeTimestampMs: number,
  driverNumber: number,
  x: number,
  y: number,
  z: number,
];

export type ArchiveLocationChunk = {
  schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  sessionKey: number;
  startMs: number;
  endMs: number;
  samples: LocationTuple[];
  guards: LocationTuple[];
};

export type CarTuple = [
  relativeTimestampMs: number,
  driverNumber: number,
  speed: number,
  gear: number,
  rpm: number,
  throttle: number,
  brake: number,
  drs: number,
];

export type ArchiveCarChunk = {
  schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  sessionKey: number;
  startMs: number;
  endMs: number;
  samples: CarTuple[];
};

export type DecodedLocationChunk = Record<number, TimedSample<OpenF1Location>[]>;

export type BuiltArchive = {
  catalog: ArchiveCatalog;
  manifest: ArchiveManifest;
  files: Map<string, string>;
};

export type BuildArchiveOptions = {
  round: number;
  car?: CarTelemetryPayload;
  chunkMs?: number;
  updatedAt?: string;
};

export type ArchiveLoadOptions = {
  signal?: AbortSignal;
  retries?: number;
};

export type CatalogLoadOptions = ArchiveLoadOptions & {
  storage?: Storage;
  ttlMs?: number;
  networkOnly?: boolean;
};
