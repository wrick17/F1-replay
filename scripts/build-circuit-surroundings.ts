import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "../src/modules/archive/hash";
import elevationCatalog from "../src/modules/replay/data/circuitElevations.json";
import type { CircuitSurroundings, MapPoint, MapPolygon } from "../src/modules/replay/types/circuitSurroundings.types";
import {
  createGeoToWorld,
  coastlineWaterPolygons,
  fitGeoLineToArchive,
  fitGeoOpenLineToArchive,
  type GeoPoint,
} from "./helpers/circuit-surroundings";
import { rotateTrackPoint } from "../src/modules/replay/services/trackBuilder.service";
import { normalizePositions } from "../src/modules/replay/utils/telemetry.util";
import { getTrackBounds3D, toTrackPoints3D } from "../src/modules/replay/utils/track3d.util";
import { circuitSurroundingsConfigs } from "./helpers/circuit-surroundings.config";

const OVERPASS_URL = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";
const OSM_SOURCE_URL = "https://www.openstreetmap.org";
const ARCHIVE_URL = "https://data.f1.wrick17.com/objects/";
const USER_AGENT = "f1-replay-circuit-surroundings/0.1 contact: wrick17";

type Bounds = [number, number, number, number];
type OsmGeometry = Array<{ lat: number; lon: number }>;
type OsmElement = {
  type: "way" | "relation";
  id: number;
  geometry?: OsmGeometry;
  members?: Array<{ type: string; ref: number; role: string; geometry?: OsmGeometry }>;
  tags?: Record<string, string>;
};

const args = process.argv.slice(2);
const value = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : (args[index + 1] ?? fallback);
};
const writeManifest = async (outputDir: string) => {
  const circuits = [];
  for (const circuitKey of Object.keys(circuitSurroundingsConfigs).map(Number).sort((a, b) => a - b)) {
    const path = join(outputDir, `${circuitKey}.json`);
    if (!(await Bun.file(path).exists())) throw new Error(`Circuit ${circuitKey} bundle is missing`);
    const text = await Bun.file(path).text();
    const data = JSON.parse(text) as CircuitSurroundings & {
      alignment: { method: string; rmsMeters: number; maxErrorMeters: number };
    };
    const polygonVertices = (polygons: MapPolygon[]) =>
      polygons.reduce(
        (sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0),
        0,
      );
    const buildingVertices = data.buildings.reduce(
      (sum, building) => sum + polygonVertices(building.polygons),
      0,
    );
    const roadVertices = data.roads.reduce((sum, road) => sum + road.points.length, 0);
    const areaVertices = data.areas.reduce(
      (sum, area) => sum + polygonVertices(area.polygons),
      0,
    );
    circuits.push({
      circuitKey,
      snapshotAt: data.source.snapshotAt,
      bytes: new TextEncoder().encode(text).byteLength,
      gzipBytes: Bun.gzipSync(new TextEncoder().encode(text)).byteLength,
      featureCounts: {
        buildings: data.buildings.length,
        roads: data.roads.length,
        areas: data.areas.length,
      },
      vertexCounts: {
        buildings: buildingVertices,
        roads: roadVertices,
        areas: areaVertices,
        total: buildingVertices + roadVertices + areaVertices,
      },
      terrain: data.terrain
        ? {
            width: data.terrain.width,
            height: data.terrain.height,
            minimumMeters: Math.min(...data.terrain.heights),
            maximumMeters: Math.max(...data.terrain.heights),
          }
        : null,
      coverage: data.coverage,
      alignment: data.alignment,
    });
  }
  await Bun.write(
    join(outputDir, "index.json"),
    `${JSON.stringify({ schemaVersion: 1, circuits }, null, 2)}\n`,
  );
};
const configuredOutputDir = value("--output", "public/circuits");
if (args.includes("--manifest")) {
  await writeManifest(configuredOutputDir);
  process.exit(0);
}
if (args.includes("--all")) {
  const forwarded = args.filter((argument) => argument !== "--all");
  const firstKey = Number(value("--from", "0"));
  for (const key of Object.keys(circuitSurroundingsConfigs)
    .map(Number)
    .filter((key) => key >= firstKey)
    .sort((a, b) => a - b)) {
    const child = Bun.spawn(
      [process.execPath, import.meta.path, ...forwarded, "--circuit", String(key)],
      { stdout: "inherit", stderr: "inherit" },
    );
    if ((await child.exited) !== 0) throw new Error(`Circuit ${key} generation failed`);
    await Bun.sleep(1_000);
  }
  await writeManifest(configuredOutputDir);
  process.exit(0);
}
const circuitKey = Number(value("--circuit", "46"));
const cacheDir = value("--cache", "/tmp/f1-circuit-surroundings");
const outputDir = configuredOutputDir;
const terrainPath = value("--terrain", "");
const skipTerrain = args.includes("--skip-terrain");
const config = circuitSurroundingsConfigs[circuitKey];
if (!config) throw new Error(`Circuit ${circuitKey} is not curated yet`);

const fetchText = async (url: string, init?: RequestInit) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init?.headers },
        signal: AbortSignal.timeout(150_000),
      });
      if (response.ok) return response.text();
      if (![429, 502, 503, 504].includes(response.status) || attempt === 3)
        throw new Error(`${response.status} fetching ${url}`);
      const retryAfter = Number(response.headers.get("Retry-After"));
      await Bun.sleep(Number.isFinite(retryAfter) ? retryAfter * 1_000 : (attempt + 1) * 5_000);
    } catch (error) {
      if (attempt === 3) throw error;
      await Bun.sleep((attempt + 1) * 5_000);
    }
  }
  throw new Error(`Retries exhausted fetching ${url}`);
};

const loadOverpass = async (query: string, label: string) => {
  const queryHash = (await sha256Hex(query)).slice(0, 16);
  const path = join(cacheDir, `${label}-${queryHash}.json`);
  if (await Bun.file(path).exists()) return Bun.file(path).text();
  const body = new URLSearchParams({ data: query });
  const text = await fetchText(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  await Bun.write(path, text);
  return text;
};

const racewayQuery = (wayIds: number[]) => `[out:json][timeout:90];
way(id:${wayIds.map(Math.abs).join(",")});
out body geom;`;

const overpassQuery = ([south, west, north, east]: Bounds) => `[out:json][timeout:120][maxsize:134217728];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  way["highway"](${south},${west},${north},${east});
  way["natural"~"^(water|wood|grassland)$"](${south},${west},${north},${east});
  way["natural"="coastline"](${south},${west},${north},${east});
  relation["natural"~"^(water|wood|grassland)$"](${south},${west},${north},${east});
  way["landuse"~"^(forest|grass|meadow|recreation_ground)$"](${south},${west},${north},${east});
  relation["landuse"~"^(forest|grass|meadow|recreation_ground)$"](${south},${west},${north},${east});
  way["leisure"~"^(park|garden|pitch)$"](${south},${west},${north},${east});
  relation["leisure"~"^(park|garden|pitch)$"](${south},${west},${north},${east});
  way["amenity"="parking"](${south},${west},${north},${east});
  relation["amenity"="parking"](${south},${west},${north},${east});
);
out body geom;`;

await mkdir(cacheDir, { recursive: true });
const racewayOsm = JSON.parse(
  await loadOverpass(racewayQuery(config.racewayWayIds), `${circuitKey}-raceway`),
) as {
  osm3s?: { timestamp_osm_base?: string };
  elements: OsmElement[];
};
if (!Array.isArray(racewayOsm.elements)) throw new Error("Invalid Overpass raceway response");

const profile = elevationCatalog.profiles.find((item) => item.circuitKey === circuitKey);
if (!profile) throw new Error(`Circuit ${circuitKey} has no archive geometry profile`);
const corePath = join(cacheDir, `${profile.source.coreSha256}.json`);
let coreText = (await Bun.file(corePath).exists()) ? await Bun.file(corePath).text() : "";
if (!coreText) {
  coreText = await fetchText(`${ARCHIVE_URL}${profile.source.coreSha256}.json`);
  if ((await sha256Hex(coreText)) !== profile.source.coreSha256)
    throw new Error("Archive core hash mismatch");
  await Bun.write(corePath, coreText);
}
if ((await sha256Hex(coreText)) !== profile.source.coreSha256)
  throw new Error("Cached archive core hash mismatch");
const core = JSON.parse(coreText).payload;
const archiveLine = core.trackGeometry?.points as Array<[number, number]> | undefined;
if (!archiveLine || archiveLine.length < 3 || core.trackGeometry.rotation !== profile.geometry.rotationDegrees)
  throw new Error("Archive geometry does not match elevation profile");

const byId = new Map(racewayOsm.elements.map((element) => [element.id, element]));
const raceway: GeoPoint[] = [];
const openAlignmentIds = new Set(config.openAlignmentWayIds?.map(Math.abs) ?? []);
for (const signedId of config.racewayWayIds) {
  const id = Math.abs(signedId);
  const source = byId.get(id)?.geometry;
  if (!source?.length) throw new Error(`Missing curated OSM raceway way ${id}`);
  const geometry = signedId < 0 ? [...source].reverse() : source;
  const selectedForAlignment = !openAlignmentIds.size || openAlignmentIds.has(id);
  if (raceway.length && selectedForAlignment) {
    const previous = raceway.at(-1)!;
    const first = geometry[0];
    const gap = Math.hypot(
      (previous.lat - first.lat) * 111_132,
      (previous.lon - first.lon) * 111_320 * Math.cos((first.lat * Math.PI) / 180),
    );
    if (gap > 1) throw new Error(`OSM raceway has a ${gap.toFixed(2)}m gap before way ${id}`);
  }
  if (openAlignmentIds.size) {
    if (selectedForAlignment) raceway.push(...(raceway.length ? geometry.slice(1) : geometry));
  } else {
    raceway.push(...(raceway.length ? geometry.slice(1) : geometry));
  }
}
const fit =
  config.fixedFit ??
  (openAlignmentIds.size
    ? fitGeoOpenLineToArchive(raceway, archiveLine)
    : fitGeoLineToArchive(raceway, archiveLine, 1_000));
if (
  fit.rmsMeters > (config.maxRmsMeters ?? 10) ||
  fit.maxErrorMeters > (config.maxErrorMeters ?? 20)
)
  throw new Error(
    `OSM alignment rejected at ${fit.rmsMeters.toFixed(2)}m RMS/${fit.maxErrorMeters.toFixed(2)}m max`,
  );
const { transform, metersToWorld } = createGeoToWorld(
  fit,
  archiveLine,
  core.trackGeometry.rotation,
);
const normalization = normalizePositions(
  archiveLine.map(([x, y]) => ({ x, y, z: 0 })),
);
const trackPoints = toTrackPoints3D(
  normalization.normalized.map((point) => rotateTrackPoint(point, core.trackGeometry.rotation)),
);
const trackBounds = getTrackBounds3D(trackPoints);
const distanceToTrack = ([x, y]: MapPoint) => {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < trackPoints.length; index++) {
    const a = trackPoints[index];
    const b = trackPoints[(index + 1) % trackPoints.length];
    const dx = b.x - a.x;
    const dy = b.z - a.z;
    const fraction = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (y - a.z) * dy) / (dx * dx + dy * dy || 1)),
    );
    nearest = Math.min(
      nearest,
      Math.hypot(x - a.x - fraction * dx, y - a.z - fraction * dy),
    );
  }
  return nearest / metersToWorld;
};
const validationErrors = config.racewayWayIds.flatMap((signedId) =>
  (byId.get(Math.abs(signedId))?.geometry ?? []).map((point) => distanceToTrack(transform(point))),
);
const orderedValidationErrors = [...validationErrors].sort((a, b) => a - b);
const validationRmsMeters = Math.sqrt(
  validationErrors.reduce((sum, error) => sum + error * error, 0) / validationErrors.length,
);
const validationP95Meters = orderedValidationErrors[Math.floor(orderedValidationErrors.length * 0.95)];
const validationMaxMeters = orderedValidationErrors.at(-1)!;
if (
  openAlignmentIds.size > 0 &&
  (validationP95Meters > 20 || validationMaxMeters > 35)
)
  throw new Error(
    `Open alignment validation rejected at ${validationP95Meters.toFixed(2)}m p95/${validationMaxMeters.toFixed(2)}m max`,
  );
const halfExtent = 2.2 * Math.max(trackBounds.width, trackBounds.depth, 0.5);
const coverageBounds: Bounds = [
  trackBounds.centerZ - halfExtent,
  trackBounds.centerX - halfExtent,
  trackBounds.centerZ + halfExtent,
  trackBounds.centerX + halfExtent,
];
const { inverse } = createGeoToWorld(fit, archiveLine, core.trackGeometry.rotation);
const coverageCorners = [
  inverse([coverageBounds[1], coverageBounds[0]]),
  inverse([coverageBounds[3], coverageBounds[0]]),
  inverse([coverageBounds[3], coverageBounds[2]]),
  inverse([coverageBounds[1], coverageBounds[2]]),
];
const queryBounds: Bounds = [
  Math.min(...coverageCorners.map((point) => point.lat)),
  Math.min(...coverageCorners.map((point) => point.lon)),
  Math.max(...coverageCorners.map((point) => point.lat)),
  Math.max(...coverageCorners.map((point) => point.lon)),
];
const osmText = await loadOverpass(overpassQuery(queryBounds), `${circuitKey}-map`);
const osm = JSON.parse(osmText) as {
  osm3s?: { timestamp_osm_base?: string };
  elements: OsmElement[];
};
if (!Array.isArray(osm.elements)) throw new Error("Invalid Overpass map response");
const round = (number: number) => Number(number.toFixed(7));
const mapLine = (geometry: OsmGeometry): MapPoint[] =>
  geometry.map((point) => transform(point).map(round) as MapPoint);
const pointSegmentDistance = (point: MapPoint, a: MapPoint, b: MapPoint) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fraction = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(point[0] - a[0] - fraction * dx, point[1] - a[1] - fraction * dy);
};
const simplifyOpenLine = (points: MapPoint[], tolerance = metersToWorld): MapPoint[] => {
  if (points.length <= 2) return points;
  const keep = new Set([0, points.length - 1]);
  const ranges: Array<[number, number]> = [[0, points.length - 1]];
  while (ranges.length) {
    const [start, end] = ranges.pop()!;
    let farthest = -1;
    let distance = tolerance;
    for (let index = start + 1; index < end; index++) {
      const candidate = pointSegmentDistance(points[index], points[start], points[end]);
      if (candidate > distance) {
        distance = candidate;
        farthest = index;
      }
    }
    if (farthest >= 0) {
      keep.add(farthest);
      ranges.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep.has(index));
};
const simplifyRing = (ring: MapPoint[]): MapPoint[] => {
  const open = ring.slice(0, -1);
  if (open.length <= 3) return ring;
  let split = 1;
  for (let index = 2; index < open.length; index++)
    if (
      Math.hypot(open[index][0] - open[0][0], open[index][1] - open[0][1]) >
      Math.hypot(open[split][0] - open[0][0], open[split][1] - open[0][1])
    )
      split = index;
  const first = simplifyOpenLine(open.slice(0, split + 1));
  const second = simplifyOpenLine([...open.slice(split), open[0]]);
  const simplified = [...first.slice(0, -1), ...second];
  return simplified.length >= 4 ? simplified : ring;
};
const [coverageMinY, coverageMinX, coverageMaxY, coverageMaxX] = coverageBounds;
const clipRing = (ring: MapPoint[]): MapPoint[] => {
  let points = ring.slice(0, -1);
  const edges = [
    {
      inside: ([x]: MapPoint) => x >= coverageMinX,
      intersect: (a: MapPoint, b: MapPoint): MapPoint => [
        coverageMinX,
        a[1] + ((b[1] - a[1]) * (coverageMinX - a[0])) / (b[0] - a[0]),
      ],
    },
    {
      inside: ([x]: MapPoint) => x <= coverageMaxX,
      intersect: (a: MapPoint, b: MapPoint): MapPoint => [
        coverageMaxX,
        a[1] + ((b[1] - a[1]) * (coverageMaxX - a[0])) / (b[0] - a[0]),
      ],
    },
    {
      inside: ([, y]: MapPoint) => y >= coverageMinY,
      intersect: (a: MapPoint, b: MapPoint): MapPoint => [
        a[0] + ((b[0] - a[0]) * (coverageMinY - a[1])) / (b[1] - a[1]),
        coverageMinY,
      ],
    },
    {
      inside: ([, y]: MapPoint) => y <= coverageMaxY,
      intersect: (a: MapPoint, b: MapPoint): MapPoint => [
        a[0] + ((b[0] - a[0]) * (coverageMaxY - a[1])) / (b[1] - a[1]),
        coverageMaxY,
      ],
    },
  ];
  for (const edge of edges) {
    const input = points;
    points = [];
    if (!input.length) break;
    let previous = input.at(-1)!;
    for (const current of input) {
      const previousInside = edge.inside(previous);
      const currentInside = edge.inside(current);
      if (currentInside) {
        if (!previousInside) points.push(edge.intersect(previous, current));
        points.push(current);
      } else if (previousInside) points.push(edge.intersect(previous, current));
      previous = current;
    }
  }
  if (points.length < 3) return [];
  const closed = [...points.map((point) => point.map(round) as MapPoint)];
  closed.push(closed[0]);
  return simplifyRing(closed);
};
const clipSegment = (a: MapPoint, b: MapPoint): [MapPoint, MapPoint] | null => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let start = 0;
  let end = 1;
  for (const [p, q] of [
    [-dx, a[0] - coverageMinX],
    [dx, coverageMaxX - a[0]],
    [-dy, a[1] - coverageMinY],
    [dy, coverageMaxY - a[1]],
  ] as Array<[number, number]>) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const ratio = q / p;
    if (p < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end) return null;
  }
  return [
    [round(a[0] + start * dx), round(a[1] + start * dy)],
    [round(a[0] + end * dx), round(a[1] + end * dy)],
  ];
};
const clipLine = (points: MapPoint[]) => {
  const lines: MapPoint[][] = [];
  let current: MapPoint[] = [];
  const flush = () => {
    if (current.length >= 2) lines.push(simplifyOpenLine(current));
    current = [];
  };
  for (let index = 1; index < points.length; index++) {
    const clipped = clipSegment(points[index - 1], points[index]);
    if (!clipped) {
      flush();
      continue;
    }
    if (
      current.length &&
      (current.at(-1)![0] !== clipped[0][0] || current.at(-1)![1] !== clipped[0][1])
    )
      flush();
    if (!current.length) current.push(clipped[0]);
    current.push(clipped[1]);
  }
  flush();
  return lines;
};
const intersectsCoverage = (points: MapPoint[]) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return (
    maxX >= coverageBounds[1] &&
    minX <= coverageBounds[3] &&
    maxY >= coverageBounds[0] &&
    minY <= coverageBounds[2]
  );
};
const sameGeoPoint = (a: GeoPoint, b: GeoPoint) => a.lat === b.lat && a.lon === b.lon;

const buildTerrain = async (): Promise<NonNullable<CircuitSurroundings["terrain"]>> => {
  if (terrainPath) return Bun.file(terrainPath).json();
  const [minY, minX, maxY, maxX] = coverageBounds;
  const width = Math.min(257, Math.ceil((maxX - minX) / metersToWorld / 35) + 1);
  const height = Math.min(257, Math.ceil((maxY - minY) / metersToWorld / 35) + 1);
  const points: Array<[number, number]> = [];
  for (let row = 0; row < height; row++) {
    const y = minY + ((maxY - minY) * row) / (height - 1);
    for (let column = 0; column < width; column++) {
      const x = minX + ((maxX - minX) * column) / (width - 1);
      const point = inverse([x, y]);
      points.push([point.lon, point.lat]);
    }
  }
  const input = JSON.stringify({ points });
  const key = (await sha256Hex(input)).slice(0, 16);
  const inputPath = join(cacheDir, `${circuitKey}-terrain-${key}.input.json`);
  const outputPath = join(cacheDir, `${circuitKey}-terrain-${key}.json`);
  await Bun.write(inputPath, input);
  let sampledText = (await Bun.file(outputPath).exists()) ? await Bun.file(outputPath).text() : "";
  if (!sampledText) {
    const process = Bun.spawn(
      [
        "python3",
        "scripts/sample-copernicus-dem.py",
        inputPath,
        "--cache",
        join(cacheDir, "copernicus-dem"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(stderr.trim() || "Copernicus DEM sampling failed");
    sampledText = stdout;
    await Bun.write(outputPath, sampledText);
  }
  const sampled = JSON.parse(sampledText) as {
    heights: number[];
    source: { accessedAt: string; license: string; objects: unknown[] };
  };
  if (sampled.heights.length !== width * height)
    throw new Error(`DEM returned ${sampled.heights.length} heights for a ${width}x${height} grid`);
  return {
    width,
    height,
    bounds: [minX, minY, maxX, maxY],
    heights: sampled.heights,
    source: {
      attribution:
        "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
      url: "https://registry.opendata.aws/copernicus-dem/",
      ...sampled.source,
    },
  };
};

const stitchRings = (segments: OsmGeometry[]) => {
  const remaining = segments.filter((segment) => segment.length >= 2).map((segment) => [...segment]);
  const rings: OsmGeometry[] = [];
  while (remaining.length) {
    const ring = remaining.shift()!;
    while (!sameGeoPoint(ring[0], ring.at(-1)!)) {
      const index = remaining.findIndex(
        (segment) =>
          sameGeoPoint(ring.at(-1)!, segment[0]) || sameGeoPoint(ring.at(-1)!, segment.at(-1)!),
      );
      if (index < 0) break;
      const segment = remaining.splice(index, 1)[0];
      if (sameGeoPoint(ring.at(-1)!, segment.at(-1)!)) segment.reverse();
      ring.push(...segment.slice(1));
    }
    if (ring.length >= 4 && sameGeoPoint(ring[0], ring.at(-1)!)) rings.push(ring);
  }
  return rings;
};

const pointInRing = ([x, y]: MapPoint, ring: MapPoint[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const polygons = (element: OsmElement): MapPolygon[] => {
  let raw: MapPolygon[];
  if (element.type === "way") {
    const ring = element.geometry;
    raw = ring && ring.length >= 4 && sameGeoPoint(ring[0], ring.at(-1)!) ? [[mapLine(ring)]] : [];
  } else {
    const members = element.members ?? [];
    const outers = stitchRings(
      members.filter((member) => member.type === "way" && member.role !== "inner").flatMap((m) => m.geometry ? [m.geometry] : []),
    ).map(mapLine);
    const inners = stitchRings(
      members.filter((member) => member.type === "way" && member.role === "inner").flatMap((m) => m.geometry ? [m.geometry] : []),
    ).map(mapLine);
    raw = outers.map((outer) => [outer, ...inners.filter((inner) => pointInRing(inner[0], outer))]);
  }
  return raw.flatMap((polygon) => {
    const outer = clipRing(polygon[0]);
    if (!outer.length) return [];
    const inner = polygon.slice(1).map(clipRing).filter((ring) => ring.length && pointInRing(ring[0], outer));
    return [[outer, ...inner]];
  });
};

const relationMemberIds = new Set(
  osm.elements
    .filter((element) => element.type === "relation")
    .flatMap((element) => (element.members ?? []).map((member) => member.ref)),
);
const numberTag = (tag: string | undefined) => {
  if (!tag) return undefined;
  const number = Number.parseFloat(tag.replace(",", "."));
  if (!Number.isFinite(number) || number < 0) return undefined;
  return /(?:ft|feet|')/i.test(tag) ? number * 0.3048 : number;
};
const finiteTag = (tag: string | undefined) => {
  if (!tag) return undefined;
  const number = Number.parseFloat(tag.replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
};
const id = (element: OsmElement) => `${element.type}/${element.id}`;
const featureElements = osm.elements.filter(
  (element) => element.type === "relation" || !relationMemberIds.has(element.id),
);

const rawBuildings: CircuitSurroundings["buildings"] = [];
for (const element of featureElements.filter((item) => item.tags?.building)) {
  const shape = polygons(element).filter((polygon) => intersectsCoverage(polygon.flat()));
  if (!shape.length) continue;
  const tags = element.tags!;
  const heightM = numberTag(tags.height);
  const levels = numberTag(tags["building:levels"]);
  const minHeightM = numberTag(tags.min_height);
  rawBuildings.push({
    id: id(element),
    polygons: shape,
    ...(heightM !== undefined ? { heightM } : {}),
    ...(levels !== undefined ? { levels } : {}),
    ...(minHeightM !== undefined ? { minHeightM } : {}),
    ...(tags.building !== "yes" ? { kind: tags.building } : {}),
    ...(tags.name ? { name: tags.name } : {}),
  });
}
const buildings =
  rawBuildings.length <= 30_000
    ? rawBuildings
    : [...Map.groupBy(rawBuildings, (building) =>
        building.name
          ? building.id
          : JSON.stringify([
              building.heightM,
              building.levels,
              building.minHeightM,
              building.kind,
            ]),
      )].flatMap(([, group], index) => {
        const first = group[0];
        return [
          {
            ...first,
            id: first.name ? first.id : `buildings/${index}`,
            polygons: group.flatMap((item) => item.polygons),
          },
        ];
      });

const rawRoads: CircuitSurroundings["roads"] = osm.elements
  .filter((element) => element.type === "way" && element.tags?.highway && element.geometry?.length)
  .flatMap((element) => {
    const tags = element.tags!;
    const widthM = numberTag(tags.width);
    const layer = finiteTag(tags.layer);
    return clipLine(mapLine(element.geometry!)).map((points, index) => ({
      id: `${id(element)}${index ? `-${index}` : ""}`,
      points,
      kind: tags.highway,
      ...(widthM && widthM > 0 ? { widthM } : {}),
      ...(layer !== undefined ? { layer } : {}),
      ...(tags.bridge && tags.bridge !== "no" ? { bridge: true } : {}),
      ...(tags.tunnel && tags.tunnel !== "no" ? { tunnel: true } : {}),
    }));
  });

const pointKey = ([x, y]: MapPoint) => `${x},${y}`;
const coalesceRoads = (source: CircuitSurroundings["roads"]) => {
  const result: CircuitSurroundings["roads"] = [];
  const groups = Map.groupBy(source, (road) =>
    JSON.stringify([road.kind, road.widthM, road.layer, road.bridge, road.tunnel]),
  );
  for (const group of groups.values()) {
    const unused = new Map(group.map((road) => [road.id, road]));
    const endpoints = new Map<string, Set<string>>();
    for (const road of group) {
      for (const point of [road.points[0], road.points.at(-1)!]) {
        const key = pointKey(point);
        const ids = endpoints.get(key) ?? new Set();
        ids.add(road.id);
        endpoints.set(key, ids);
      }
    }
    const takeContinuation = (point: MapPoint) => {
      const candidates = [...(endpoints.get(pointKey(point)) ?? [])].filter((id) => unused.has(id));
      return candidates.length === 1 ? unused.get(candidates[0]) : undefined;
    };
    while (unused.size) {
      const seed = [...unused.values()].sort((a, b) => a.id.localeCompare(b.id))[0];
      unused.delete(seed.id);
      const points = [...seed.points];
      while (true) {
        const next = takeContinuation(points.at(-1)!);
        if (!next) break;
        unused.delete(next.id);
        const forward = pointKey(next.points[0]) === pointKey(points.at(-1)!);
        points.push(...(forward ? next.points.slice(1) : [...next.points].reverse().slice(1)));
      }
      while (true) {
        const previous = takeContinuation(points[0]);
        if (!previous) break;
        unused.delete(previous.id);
        const forward = pointKey(previous.points.at(-1)!) === pointKey(points[0]);
        points.unshift(...(forward ? previous.points.slice(0, -1) : [...previous.points].reverse().slice(0, -1)));
      }
      result.push({ ...seed, id: `road/${seed.id.split("/").at(-1)}`, points });
    }
  }
  return result;
};
const roads = coalesceRoads(rawRoads);

const areaKind = (tags: Record<string, string> | undefined) => {
  if (!tags) return undefined;
  if (tags.amenity === "parking") return "parking" as const;
  if (tags.natural === "water") return "water" as const;
  if (tags.natural === "wood" || tags.landuse === "forest") return "wood" as const;
  if (
    tags.natural === "grassland" ||
    ["grass", "meadow", "recreation_ground"].includes(tags.landuse) ||
    ["park", "garden", "pitch"].includes(tags.leisure)
  )
    return "grass" as const;
  return undefined;
};
const areas: CircuitSurroundings["areas"] = [];
for (const element of featureElements) {
  const kind = areaKind(element.tags);
  if (!kind) continue;
  const shape = polygons(element).filter((polygon) => intersectsCoverage(polygon.flat()));
  if (shape.length) areas.push({ id: id(element), polygons: shape, kind });
}
const sea = coastlineWaterPolygons(
  osm.elements
    .filter((element) => element.type === "way" && element.tags?.natural === "coastline")
    .flatMap((element) => clipLine(mapLine(element.geometry ?? []))),
  [coverageBounds[1], coverageBounds[0], coverageBounds[3], coverageBounds[2]],
);
if (sea.length) areas.push({ id: "derived/coastline", polygons: sea, kind: "water" });

const coverage: MapPolygon = [[
  [coverageBounds[1], coverageBounds[0]],
  [coverageBounds[3], coverageBounds[0]],
  [coverageBounds[3], coverageBounds[2]],
  [coverageBounds[1], coverageBounds[2]],
  [coverageBounds[1], coverageBounds[0]],
].map((point) => point.map(round) as MapPoint)];
const result = {
  schemaVersion: 1,
  circuitKey,
  geometry: {
    sha256: profile.geometry.sha256,
    anchors: profile.geometry.anchors,
    referencePlanarLengthRaw: profile.geometry.referencePlanarLengthRaw,
  },
  source: {
    snapshotAt: osm.osm3s?.timestamp_osm_base ?? new Date().toISOString(),
    url: OSM_SOURCE_URL,
    attribution: "© OpenStreetMap contributors, available under ODbL 1.0",
  },
  metersToWorld,
  coverage,
  ...(!skipTerrain ? { terrain: await buildTerrain() } : {}),
  buildings: buildings.sort((a, b) => a.id.localeCompare(b.id)),
  roads: roads.sort((a, b) => a.id.localeCompare(b.id)),
  areas: areas.sort((a, b) => a.id.localeCompare(b.id)),
  alignment: {
    method: openAlignmentIds.size
      ? "orientation-preserving open-fragment similarity"
      : "orientation-preserving closed-loop similarity",
    rmsMeters: fit.rmsMeters,
    maxErrorMeters: fit.maxErrorMeters,
    validationRmsMeters,
    validationP95Meters,
    validationMaxMeters,
    sourceBuildingElements: rawBuildings.length,
    sourceRoadElements: rawRoads.length,
    rawUnitsPerMeter: fit.rawUnitsPerMeter,
    reversed: fit.reversed,
    progressShift: fit.progressShift,
    osmRacewayWayIds: config.racewayWayIds,
    ...(openAlignmentIds.size ? { openAlignmentWayIds: [...openAlignmentIds] } : {}),
    ...(config.qualityNote ? { qualityNote: config.qualityNote } : {}),
    ...(config.alignmentAudit ?? {}),
  },
};
await mkdir(outputDir, { recursive: true });
const outputPath = join(outputDir, `${circuitKey}.json`);
await Bun.write(outputPath, `${JSON.stringify(result)}\n`);
console.log(
  `Wrote ${outputPath}: ${buildings.length} buildings, ${roads.length} roads, ${areas.length} areas; ` +
    `${fit.rmsMeters.toFixed(2)}m RMS/${fit.maxErrorMeters.toFixed(2)}m max alignment`,
);
