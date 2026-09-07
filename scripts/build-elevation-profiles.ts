import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { validateCatalog, validateCore, validateManifest } from "../src/modules/archive/loader";
import { sha256Hex } from "../src/modules/archive/hash";
import type {
  ArchiveCatalogSession,
  ArchiveManifest,
  ArchiveObject,
} from "../src/modules/archive/types";
import { rotateTrackPoint } from "../src/modules/replay/services/trackBuilder.service";
import suzukaElevation from "../src/modules/replay/data/suzukaElevation.json";
import { normalizePositions } from "../src/modules/replay/utils/telemetry.util";
import { type TrackPoint3D, toTrackPoints3D } from "../src/modules/replay/utils/track3d.util";

const DEFAULT_CATALOG = "https://data.f1.wrick17.com/catalog.json";
const DEFAULT_OUTPUT = "src/modules/replay/data/circuitElevations.json";
const DEFAULT_CACHE = "/tmp/f1-elevation-profiles";
const MAX_OBJECT_BYTES = 12_000_000;
const PROFILE_TOLERANCE_RAW = 3;
const ANCHOR_COUNT = 12;
const SUZUKA_CROSSING_GEOMETRY_SHA256 =
  "687cef1bf73f4f6d55805da6091711b7c3c2bc397ee7fdcc3e699a645d7a3a1f";
const encoder = new TextEncoder();

type LocationTuple = [number, number, number, number, number];
type LocationChunk = { samples: LocationTuple[]; guards: LocationTuple[] };
type Point = TrackPoint3D & { y: number };

type Candidate = {
  session: ArchiveCatalogSession;
  circuitKey: number;
  circuitName: string;
  manifest: ArchiveManifest;
  coreSha256: string;
  geometry: NonNullable<ReturnType<typeof validateCore>["payload"]["trackGeometry"]>;
  geometrySha256: string;
  locationSamples: number;
};

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : (args[index + 1] ?? fallback);
};
const catalogUrl = option("--catalog", DEFAULT_CATALOG);
const outputPath = option("--output", DEFAULT_OUTPUT);
const cacheDir = option("--cache", DEFAULT_CACHE);

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
};

const rounded = (value: number, digits = 8) => Number(value.toFixed(digits));

const fetchText = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return response.text();
};

const fetchObject = async <T>(baseUrl: URL, object: ArchiveObject): Promise<T> => {
  if (!/^objects\/[a-f0-9]{64}\.json$/.test(object.url) || !object.url.includes(object.sha256))
    throw new Error(`Invalid content-addressed object ${object.url}`);
  if (object.bytes > MAX_OBJECT_BYTES) throw new Error(`${object.url} exceeds the size limit`);
  const cachePath = join(cacheDir, `${object.sha256}.json`);
  let content = (await Bun.file(cachePath).exists()) ? await Bun.file(cachePath).text() : "";
  if (!content || (await sha256Hex(content)) !== object.sha256) {
    content = await fetchText(new URL(object.url, baseUrl).href);
    if ((await sha256Hex(content)) !== object.sha256)
      throw new Error(`SHA-256 mismatch for ${object.url}`);
    await Bun.write(cachePath, content);
  }
  if (encoder.encode(content).byteLength !== object.bytes)
    throw new Error(`Byte length mismatch for ${object.url}`);
  return JSON.parse(content) as T;
};

const mapLimit = async <T, U>(items: T[], limit: number, task: (item: T) => Promise<U>) => {
  const output = new Array<U>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
};

const pathMetrics = (points: TrackPoint3D[]) => {
  const distances = [0];
  for (let index = 1; index < points.length; index++)
    distances.push(
      distances[index - 1] +
        Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z),
    );
  const total =
    distances.at(-1)! +
    Math.hypot(points[0].x - points.at(-1)!.x, points[0].z - points.at(-1)!.z);
  return { distances, total };
};

const pointAtProgress = (
  points: TrackPoint3D[],
  distances: number[],
  total: number,
  progress: number,
) => {
  const target = progress * total;
  let index = 0;
  while (index < points.length - 1 && distances[index + 1] < target) index++;
  const next = (index + 1) % points.length;
  const start = distances[index];
  const end = next ? distances[next] : total;
  const fraction = (target - start) / (end - start || 1);
  return {
    x: points[index].x + (points[next].x - points[index].x) * fraction,
    z: points[index].z + (points[next].z - points[index].z) * fraction,
  };
};

const simplifyProfile = (points: number[][], tolerance: number): number[][] => {
  if (points.length <= 2) return points;
  const [first, last] = [points[0], points.at(-1)!];
  let maximum = -1;
  let split = -1;
  for (let index = 1; index < points.length - 1; index++) {
    const fraction = (points[index][0] - first[0]) / (last[0] - first[0] || 1);
    const expected = first[1] + (last[1] - first[1]) * fraction;
    const error = Math.abs(points[index][1] - expected);
    if (error > maximum) {
      maximum = error;
      split = index;
    }
  }
  if (maximum <= tolerance) return [first, last];
  return [
    ...simplifyProfile(points.slice(0, split + 1), tolerance).slice(0, -1),
    ...simplifyProfile(points.slice(split), tolerance),
  ];
};

const geometryIdentity = async (geometry: Candidate["geometry"]) =>
  sha256Hex(
    JSON.stringify({
      points: geometry.points,
      rotation: geometry.rotation,
      source: geometry.source,
    }),
  );

const preparedGeometry = (geometry: Candidate["geometry"]) => {
  const normalization = normalizePositions(
    geometry.points.map(([x, y]) => ({ x, y, z: 0 })),
  );
  const path = normalization.normalized.map((point) => rotateTrackPoint(point, geometry.rotation));
  if (path.length) path.push(path[0]);
  const points = toTrackPoints3D(path, true);
  const metrics = pathMetrics(points);
  return { normalization, points, ...metrics };
};

const validateLocationChunk = (value: unknown, expectedSamples: number): LocationChunk => {
  if (!value || typeof value !== "object") throw new Error("Location chunk is not an object");
  const chunk = value as Partial<LocationChunk>;
  if (!Array.isArray(chunk.samples) || !Array.isArray(chunk.guards))
    throw new Error("Location chunk is missing tuples");
  if (chunk.samples.length !== expectedSamples) throw new Error("Location sample count mismatch");
  for (const tuple of [...chunk.samples, ...chunk.guards]) {
    if (!Array.isArray(tuple) || tuple.length !== 5 || tuple.some((item) => !Number.isFinite(item)))
      throw new Error("Invalid location tuple");
  }
  return chunk as LocationChunk;
};

const buildProfile = async (
  baseUrl: URL,
  candidate: Candidate,
  catalogAppearances: Candidate[],
) => {
  const { geometry, manifest } = candidate;
  const prepared = preparedGeometry(geometry);
  const chunks = await mapLimit(manifest.locations, 6, async (object) =>
    validateLocationChunk(
      await fetchObject<LocationChunk>(baseUrl, object),
      object.samples,
    ),
  );
  const byDriver = new Map<number, LocationTuple[]>();
  for (const chunk of chunks)
    for (const tuple of chunk.samples) {
      const samples = byDriver.get(tuple[1]);
      if (samples) samples.push(tuple);
      else byDriver.set(tuple[1], [tuple]);
    }

  const { scale, offset } = prepared.normalization;
  const transform = (x: number, y: number) =>
    rotateTrackPoint(
      { x: (x - offset.x) * scale, y: (y - offset.y) * scale, z: 0 },
      geometry.rotation,
    );
  const enriched: Array<{ x: number; z: number; height: number; tx: number; tz: number }> = [];
  for (const samples of byDriver.values()) {
    samples.sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < samples.length - 1; index++) {
      const [before, sample, after] = [samples[index - 1], samples[index], samples[index + 1]];
      if (after[0] - before[0] > 1_500) continue;
      const point = transform(sample[2], sample[3]);
      const previous = transform(before[2], before[3]);
      const next = transform(after[2], after[3]);
      const dx = next.x - previous.x;
      const dz = next.y - previous.y;
      const length = Math.hypot(dx, dz);
      if (length <= 1e-7 || length >= 0.08) continue;
      enriched.push({ x: point.x, z: point.y, height: sample[4], tx: dx / length, tz: dz / length });
    }
  }

  const bucketSize = 0.02;
  const buckets = new Map<string, typeof enriched>();
  for (const sample of enriched) {
    const key = `${Math.floor(sample.x / bucketSize)}:${Math.floor(sample.z / bucketSize)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(sample);
    else buckets.set(key, [sample]);
  }
  const nearby = (point: TrackPoint3D, tx: number, tz: number, radius: number, alignment: number) => {
    const values: Array<{ distance: number; height: number }> = [];
    const cells = Math.ceil(radius / bucketSize);
    const bx = Math.floor(point.x / bucketSize);
    const bz = Math.floor(point.z / bucketSize);
    for (let x = bx - cells; x <= bx + cells; x++)
      for (let z = bz - cells; z <= bz + cells; z++)
        for (const sample of buckets.get(`${x}:${z}`) ?? []) {
          const distance = Math.hypot(sample.x - point.x, sample.z - point.z);
          if (distance <= radius && Math.abs(sample.tx * tx + sample.tz * tz) >= alignment)
            values.push({ distance, height: sample.height });
        }
    values.sort((a, b) => a.distance - b.distance);
    return values.slice(0, 240).map((value) => value.height);
  };

  const heights: number[] = [];
  const candidateCounts: number[] = [];
  const deviations: number[] = [];
  for (let index = 0; index < prepared.points.length; index++) {
    const previous = prepared.points[(index - 1 + prepared.points.length) % prepared.points.length];
    const next = prepared.points[(index + 1) % prepared.points.length];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    let values = nearby(prepared.points[index], dx / length, dz / length, 0.009, 0.72);
    if (values.length < 20)
      values = nearby(prepared.points[index], dx / length, dz / length, 0.018, 0.55);
    candidateCounts.push(values.length);
    if (!values.length) {
      heights.push(Number.NaN);
      deviations.push(Number.POSITIVE_INFINITY);
      continue;
    }
    const height = median(values);
    heights.push(height);
    deviations.push(median(values.map((value) => Math.abs(value - height))));
  }
  const coverage = heights.filter(Number.isFinite).length / heights.length;
  if (coverage < 1 || Math.min(...candidateCounts) < 20)
    throw new Error(`insufficient canonical coverage (${rounded(coverage * 100, 2)}%)`);
  const smooth = heights.map((_, index) =>
    median(
      [-2, -1, 0, 1, 2].map(
        (offset) => heights[(index + offset + heights.length) % heights.length],
      ),
    ),
  );
  const range = Math.max(...smooth) - Math.min(...smooth);
  if (range < 1) throw new Error("telemetry Z is constant");
  const baseline = Math.min(...smooth);
  const profile = prepared.distances.map((distance, index) => [
    distance / prepared.total,
    smooth[index] - baseline,
  ]);
  profile.push([1, profile[0][1]]);
  const samples = simplifyProfile(profile, PROFILE_TOLERANCE_RAW).map(([progress, height]) => [
    rounded(progress),
    rounded(height, 2),
  ]);
  const anchors = Array.from({ length: ANCHOR_COUNT }, (_, index) => {
    const progress = index / ANCHOR_COUNT;
    const point = pointAtProgress(prepared.points, prepared.distances, prepared.total, progress);
    return [rounded(progress), rounded(point.x), rounded(point.z)];
  });
  return {
    id: `${candidate.circuitKey}:${candidate.geometrySha256}`,
    circuitKey: candidate.circuitKey,
    circuitName: candidate.circuitName,
    geometry: {
      sha256: candidate.geometrySha256,
      source: geometry.source,
      pointCount: geometry.points.length,
      cleanedPointCount: prepared.points.length,
      rotationDegrees: geometry.rotation,
      referencePlanarLengthRaw: rounded(prepared.total / prepared.normalization.scale, 6),
      catalogSessionCount: catalogAppearances.length,
      catalogYears: [...new Set(catalogAppearances.map((item) => item.session.year))].sort(),
      anchors,
    },
    source: {
      year: candidate.session.year,
      round: candidate.session.round,
      sessionKey: candidate.session.sessionKey,
      manifestSha256: candidate.session.manifest.sha256,
      coreSha256: candidate.coreSha256,
      locationChunkSha256s: manifest.locations.map((chunk) => chunk.sha256),
    },
    referenceZBaselineRaw: rounded(baseline, 2),
    samples,
    ...(candidate.geometrySha256 === SUZUKA_CROSSING_GEOMETRY_SHA256
      ? { crossing: suzukaElevation.crossing }
      : {}),
    quality: {
      method:
        "Direction-aware median of archived race telemetry near each cleaned canonical point; five-point circular median; linear-error simplification.",
      telemetrySamples: chunks.reduce((sum, chunk) => sum + chunk.samples.length, 0),
      canonicalCoverage: coverage,
      minCandidates: Math.min(...candidateCounts),
      medianCandidates: median(candidateCounts),
      rawZRange: rounded(range, 2),
      p95MedianAbsoluteDeviationRaw: rounded(percentile(deviations, 0.95), 2),
      seamDeltaRaw: rounded(Math.abs(smooth[0] - smooth.at(-1)!), 2),
      simplificationToleranceRaw: PROFILE_TOLERANCE_RAW,
    },
  };
};

await mkdir(cacheDir, { recursive: true });
const catalogText = await fetchText(catalogUrl);
const catalog = validateCatalog(JSON.parse(catalogText));
const baseUrl = new URL(".", catalogUrl);
console.log(`Inventorying ${catalog.sessions.length} archived sessions...`);
const candidates = await mapLimit(catalog.sessions, 10, async (session): Promise<Candidate> => {
  const manifest = validateManifest(
    await fetchObject<unknown>(baseUrl, session.manifest),
    session,
  );
  const core = validateCore(await fetchObject<unknown>(baseUrl, manifest.core), manifest);
  if (!core.payload.trackGeometry) throw new Error(`Session ${session.sessionKey} has no geometry`);
  const circuitKey = session.meeting.circuit_key;
  const circuitName = session.meeting.circuit_short_name;
  if (!Number.isInteger(circuitKey) || !circuitName)
    throw new Error(`Session ${session.sessionKey} has invalid circuit metadata`);
  return {
    session,
    circuitKey: circuitKey!,
    circuitName,
    manifest,
    coreSha256: manifest.core.sha256,
    geometry: core.payload.trackGeometry,
    geometrySha256: await geometryIdentity(core.payload.trackGeometry),
    locationSamples: manifest.locations.reduce((sum, chunk) => sum + chunk.samples, 0),
  };
});

const layouts = new Map<string, Candidate[]>();
for (const candidate of candidates) {
  const key = `${candidate.circuitKey}:${candidate.geometrySha256}`;
  const appearances = layouts.get(key);
  if (appearances) appearances.push(candidate);
  else layouts.set(key, [candidate]);
}

const profiles: Awaited<ReturnType<typeof buildProfile>>[] = [];
const gaps: Array<Record<string, unknown>> = [];
for (const appearances of [...layouts.values()].sort(
  (a, b) => a[0]!.circuitKey - b[0]!.circuitKey,
)) {
  appearances.sort(
    (a, b) =>
      Number(b.session.type === "Race") - Number(a.session.type === "Race") ||
      b.locationSamples - a.locationSamples,
  );
  const candidate =
    appearances.find((item) => item.session.sessionKey === 10006) ?? appearances[0]!;
  const { circuitKey, circuitName } = candidate;
  try {
    console.log(`Building ${circuitName} (${circuitKey}) from session ${candidate.session.sessionKey}...`);
    profiles.push(await buildProfile(baseUrl, candidate, appearances));
  } catch (error) {
    const prepared = preparedGeometry(candidate.geometry);
    gaps.push({
      circuitKey,
      circuitName,
      geometry: {
        sha256: candidate.geometrySha256,
        pointCount: candidate.geometry.points.length,
        cleanedPointCount: prepared.points.length,
        rotationDegrees: candidate.geometry.rotation,
      },
      sourceSessionKey: candidate.session.sessionKey,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

const result = {
  schemaVersion: 1,
  sourceCatalog: { url: catalogUrl, updatedAt: catalog.updatedAt },
  coordinateUnits:
    "Raw OpenF1 Cartesian source units; OpenF1 documents x/y/z without a physical unit.",
  anchorConvention:
    "Twelve evenly spaced closed-loop planar fractions after normalizePositions, source rotation, closure, and toTrackPoints3D cleanup.",
  catalogCoverage: {
    sessions: catalog.sessions.length,
    circuitKeys: new Set(candidates.map((candidate) => candidate.circuitKey)).size,
    geometryIdentities: layouts.size,
    profiles: profiles.length,
    gaps: gaps.length,
  },
  profiles,
  gaps,
};
if (profiles.length + gaps.length !== layouts.size)
  throw new Error("Not every catalog geometry identity produced a profile or gap");
if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length)
  throw new Error("Duplicate elevation profile identity");
for (const profile of profiles) {
  if (profile.geometry.anchors.length !== ANCHOR_COUNT)
    throw new Error(`${profile.id} has incomplete alignment anchors`);
  if (
    profile.samples.length < 2 ||
    profile.samples[0][0] !== 0 ||
    profile.samples.at(-1)![0] !== 1 ||
    profile.samples[0][1] !== profile.samples.at(-1)![1] ||
    profile.samples.some(
      (sample, index) =>
        !sample.every(Number.isFinite) ||
        (index > 0 && sample[0] <= profile.samples[index - 1][0]),
    )
  )
    throw new Error(`${profile.id} has an invalid elevation sample sequence`);
}
const compactNumericArrays = JSON.stringify(result, null, 2)
  .replace(
    /\[\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?)\n\s+\]/g,
    "[$1, $2, $3, $4]",
  )
  .replace(
    /\[\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?)\n\s+\]/g,
    "[$1, $2, $3]",
  )
  .replace(
    /\[\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?)\n\s+\]/g,
    "[$1, $2]",
  );
await Bun.write(outputPath, `${compactNumericArrays}\n`);
console.log(`Wrote ${profiles.length} profiles and ${gaps.length} gaps to ${outputPath}`);
