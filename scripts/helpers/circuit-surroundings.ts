import { rotateTrackPoint } from "../../src/modules/replay/services/trackBuilder.service";
import { normalizePositions } from "../../src/modules/replay/utils/telemetry.util";
import { mapContainsPoint } from "../../src/modules/replay/utils/circuitMapGeometry.util";

export type GeoPoint = { lat: number; lon: number };
export type Point2 = [number, number];

export type SimilarityFit = {
  origin: GeoPoint;
  rawUnitsPerMeter: number;
  rotation: [number, number];
  translationRaw: Point2;
  reversed: boolean;
  progressShift: number;
  rmsMeters: number;
  maxErrorMeters: number;
};

/** Close directed OSM coastlines against the map bounds. OSM keeps seawater on their right. */
export const coastlineWaterPolygons = (
  lines: Point2[][],
  [minX, minY, maxX, maxY]: [number, number, number, number],
) => {
  const same = (a: Point2, b: Point2) => a[0] === b[0] && a[1] === b[1];
  const unused = lines.filter((line) => line.length >= 2).map((line) => [...line]);
  const chains: Point2[][] = [];
  while (unused.length) {
    const chain = unused.shift()!;
    while (true) {
      const next = unused.findIndex((line) => same(chain.at(-1)!, line[0]));
      if (next >= 0) {
        chain.push(...unused.splice(next, 1)[0].slice(1));
        continue;
      }
      const previous = unused.findIndex((line) => same(line.at(-1)!, chain[0]));
      if (previous < 0) break;
      chain.unshift(...unused.splice(previous, 1)[0].slice(0, -1));
    }
    chains.push(chain);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const perimeter = 2 * (width + height);
  const boundaryPosition = ([x, y]: Point2) => {
    const epsilon = Math.max(width, height) * 1e-6;
    if (Math.abs(y - minY) <= epsilon) return x - minX;
    if (Math.abs(x - maxX) <= epsilon) return width + y - minY;
    if (Math.abs(y - maxY) <= epsilon) return 2 * width + height - x + minX;
    if (Math.abs(x - minX) <= epsilon) return 2 * width + 2 * height - y + minY;
    return undefined;
  };
  const boundaryPoint = (position: number): Point2 => {
    const value = ((position % perimeter) + perimeter) % perimeter;
    if (value <= width) return [minX + value, minY];
    if (value <= width + height) return [maxX, minY + value - width];
    if (value <= 2 * width + height) return [maxX - value + width + height, maxY];
    return [minX, maxY - value + 2 * width + height];
  };
  const counterClockwiseBoundary = (from: Point2, to: Point2) => {
    const start = boundaryPosition(from);
    const finish = boundaryPosition(to);
    if (start === undefined || finish === undefined) return [];
    const distance = ((finish - start) % perimeter + perimeter) % perimeter;
    const points = [from];
    const corners = [width, width + height, 2 * width + height, perimeter]
      .map((position) => ({
        position,
        offset: ((position - start) % perimeter + perimeter) % perimeter,
      }))
      .filter(({ offset }) => offset > 0 && offset < distance)
      .sort((a, b) => a.offset - b.offset);
    for (const corner of corners) points.push(boundaryPoint(corner.position));
    points.push(to);
    return points;
  };
  const signedArea = (ring: Point2[]) =>
    ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2;
  const islands = chains.filter((line) => same(line[0], line.at(-1)!));
  const coasts = chains.filter((line) => !same(line[0], line.at(-1)!));
  const polygons = coasts.flatMap((line) => {
    const ccw = counterClockwiseBoundary(line.at(-1)!, line[0]);
    const clockwise = [...counterClockwiseBoundary(line[0], line.at(-1)!)].reverse();
    if (!ccw.length || !clockwise.length)
      throw new Error("Coastline chain has an endpoint inside the map bounds");
    const first = [...line, ...ccw.slice(1)];
    const second = [...line, ...clockwise.slice(1)];
    const outer = signedArea(first) < signedArea(second) ? first : second;
    return [[outer, ...islands.filter((island) => mapContainsPoint(island[0], [outer]))]];
  });
  if (!polygons.length && islands.length)
    polygons.push([[
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ], ...islands]);
  return polygons;
};

const distance = (a: Point2, b: Point2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export const geoToMeters = (point: GeoPoint, origin: GeoPoint): Point2 => [
  (point.lon - origin.lon) * 111_320 * Math.cos((origin.lat * Math.PI) / 180),
  (point.lat - origin.lat) * 111_132,
];

export const resampleClosedLine = (points: Point2[], count = 1_000) => {
  const closed = [...points, points[0]];
  const cumulative = [0];
  for (let index = 1; index < closed.length; index++)
    cumulative.push(cumulative[index - 1] + distance(closed[index - 1], closed[index]));
  const length = cumulative.at(-1) ?? 0;
  let segment = 0;
  const samples = Array.from({ length: count }, (_, index): Point2 => {
    const target = (index / count) * length;
    while (segment < closed.length - 2 && cumulative[segment + 1] < target) segment++;
    const span = cumulative[segment + 1] - cumulative[segment] || 1;
    const fraction = (target - cumulative[segment]) / span;
    return [
      closed[segment][0] + (closed[segment + 1][0] - closed[segment][0]) * fraction,
      closed[segment][1] + (closed[segment + 1][1] - closed[segment][1]) * fraction,
    ];
  });
  return { samples, length };
};

const lineDistances = (points: Point2[], closed: boolean) => {
  const line = closed ? [...points, points[0]] : points;
  const cumulative = [0];
  for (let index = 1; index < line.length; index++)
    cumulative.push(cumulative[index - 1] + distance(line[index - 1], line[index]));
  return { line, cumulative, length: cumulative.at(-1) ?? 0 };
};

const pointAtDistance = (
  source: ReturnType<typeof lineDistances>,
  distanceAlong: number,
  wrap: boolean,
): Point2 => {
  const target = wrap
    ? ((distanceAlong % source.length) + source.length) % source.length
    : Math.max(0, Math.min(source.length, distanceAlong));
  let low = 0;
  let high = source.cumulative.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (source.cumulative[middle] <= target) low = middle;
    else high = middle;
  }
  const span = source.cumulative[high] - source.cumulative[low] || 1;
  const fraction = (target - source.cumulative[low]) / span;
  return [
    source.line[low][0] + (source.line[high][0] - source.line[low][0]) * fraction,
    source.line[low][1] + (source.line[high][1] - source.line[low][1]) * fraction,
  ];
};

const fitCorrespondence = (source: Point2[], target: Point2[]) => {
  const mean = (points: Point2[], axis: 0 | 1) =>
    points.reduce((sum, point) => sum + point[axis], 0) / points.length;
  const sourceMean: Point2 = [mean(source, 0), mean(source, 1)];
  const targetMean: Point2 = [mean(target, 0), mean(target, 1)];
  let real = 0;
  let imaginary = 0;
  let denominator = 0;
  for (let index = 0; index < source.length; index++) {
    const x = source[index][0] - sourceMean[0];
    const y = source[index][1] - sourceMean[1];
    const u = target[index][0] - targetMean[0];
    const v = target[index][1] - targetMean[1];
    real += u * x + v * y;
    imaginary += v * x - u * y;
    denominator += x * x + y * y;
  }
  const a = real / denominator;
  const b = imaginary / denominator;
  const scale = Math.hypot(a, b);
  const translation: Point2 = [
    targetMean[0] - (a * sourceMean[0] - b * sourceMean[1]),
    targetMean[1] - (b * sourceMean[0] + a * sourceMean[1]),
  ];
  const errors = source.map(([x, y], index) =>
    distance(
      [a * x - b * y + translation[0], b * x + a * y + translation[1]],
      target[index],
    ),
  );
  return { a, b, scale, translation, errors };
};

export const fitGeoLineToArchive = (
  geoLine: GeoPoint[],
  archiveLine: Point2[],
  sampleCount = 1_000,
): SimilarityFit => {
  const origin = {
    lat: geoLine.reduce((sum, point) => sum + point.lat, 0) / geoLine.length,
    lon: geoLine.reduce((sum, point) => sum + point.lon, 0) / geoLine.length,
  };
  const source = resampleClosedLine(
    geoLine.map((point) => geoToMeters(point, origin)),
    sampleCount,
  ).samples;
  const target = resampleClosedLine(archiveLine, sampleCount).samples;
  let best:
    | (ReturnType<typeof fitCorrespondence> & { reversed: boolean; shift: number })
    | undefined;
  for (const reversed of [false, true]) {
    const ordered = reversed ? [...source].reverse() : source;
    for (let shift = 0; shift < sampleCount; shift++) {
      const fit = fitCorrespondence(
        ordered,
        target.map((_, index) => target[(index + shift) % sampleCount]),
      );
      const squared = fit.errors.reduce((sum, error) => sum + error * error, 0);
      if (!best || squared < best.errors.reduce((sum, error) => sum + error * error, 0))
        best = { ...fit, reversed, shift };
    }
  }
  if (!best || !Number.isFinite(best.scale) || best.scale <= 0)
    throw new Error("Could not align OSM raceway to archive geometry");
  const meterErrors = best.errors.map((error) => error / best.scale);
  return {
    origin,
    rawUnitsPerMeter: best.scale,
    rotation: [best.a / best.scale, best.b / best.scale],
    translationRaw: best.translation,
    reversed: best.reversed,
    progressShift: best.shift / sampleCount,
    rmsMeters: Math.sqrt(
      meterErrors.reduce((sum, error) => sum + error * error, 0) / meterErrors.length,
    ),
    maxErrorMeters: Math.max(...meterErrors),
  };
};

/** Align a mapped street-race fragment when OSM does not tag the whole public-road lap as a raceway. */
export const fitGeoOpenLineToArchive = (
  geoLine: GeoPoint[],
  archiveLine: Point2[],
  sampleCount = 80,
): SimilarityFit => {
  if (geoLine.length < 3 || archiveLine.length < 3)
    throw new Error("Open-line alignment requires at least three points");
  const origin = {
    lat: geoLine.reduce((sum, point) => sum + point.lat, 0) / geoLine.length,
    lon: geoLine.reduce((sum, point) => sum + point.lon, 0) / geoLine.length,
  };
  const sourceLine = lineDistances(
    geoLine.map((point) => geoToMeters(point, origin)),
    false,
  );
  const targetLine = lineDistances(archiveLine, true);
  const source = Array.from({ length: sampleCount }, (_, index) =>
    pointAtDistance(sourceLine, (sourceLine.length * index) / (sampleCount - 1), false),
  );
  let best:
    | (ReturnType<typeof fitCorrespondence> & { reversed: boolean; shift: number })
    | undefined;
  for (const reversed of [false, true]) {
    for (let shift = 0; shift < 1_000; shift++) {
      for (const spanMultiplier of [0.94, 0.97, 1, 1.03, 1.06]) {
        const start = (targetLine.length * shift) / 1_000;
        const span = sourceLine.length * 10 * spanMultiplier;
        const target = Array.from({ length: sampleCount }, (_, index) =>
          pointAtDistance(
            targetLine,
            start + (reversed ? -1 : 1) * span * (index / (sampleCount - 1)),
            true,
          ),
        );
        const fit = fitCorrespondence(source, target);
        if (fit.scale < 9.5 || fit.scale > 10.5) continue;
        const squaredMeters =
          fit.errors.reduce((sum, error) => sum + error * error, 0) / (fit.scale * fit.scale);
        const bestSquaredMeters = best
          ? best.errors.reduce((sum, error) => sum + error * error, 0) /
            (best.scale * best.scale)
          : Number.POSITIVE_INFINITY;
        if (squaredMeters < bestSquaredMeters)
          best = { ...fit, reversed, shift };
      }
    }
  }
  if (!best) throw new Error("Could not align open OSM raceway fragment to archive geometry");
  const meterErrors = best.errors.map((error) => error / best.scale);
  return {
    origin,
    rawUnitsPerMeter: best.scale,
    rotation: [best.a / best.scale, best.b / best.scale],
    translationRaw: best.translation,
    reversed: best.reversed,
    progressShift: best.shift / 1_000,
    rmsMeters: Math.sqrt(
      meterErrors.reduce((sum, error) => sum + error * error, 0) / meterErrors.length,
    ),
    maxErrorMeters: Math.max(...meterErrors),
  };
};

export const createGeoToWorld = (
  fit: SimilarityFit,
  archiveLine: Point2[],
  rotationDegrees: number,
) => {
  const normalization = normalizePositions(
    archiveLine.map(([x, y]) => ({ x, y, z: 0 })),
  );
  const [cosine, sine] = fit.rotation;
  const rotationRadians = (rotationDegrees * Math.PI) / 180;
  const transform = (point: GeoPoint): Point2 => {
    const [east, north] = geoToMeters(point, fit.origin);
    const rawX =
      fit.rawUnitsPerMeter * (cosine * east - sine * north) + fit.translationRaw[0];
    const rawY =
      fit.rawUnitsPerMeter * (sine * east + cosine * north) + fit.translationRaw[1];
    const world = rotateTrackPoint(
      {
        x: (rawX - normalization.offset.x) * normalization.scale,
        y: (rawY - normalization.offset.y) * normalization.scale,
        z: 0,
      },
      rotationDegrees,
    );
    return [world.x, world.y];
  };
  const inverse = ([worldX, worldY]: Point2): GeoPoint => {
    const normalizedX =
      worldX * Math.cos(rotationRadians) + worldY * Math.sin(rotationRadians);
    const normalizedY =
      -worldX * Math.sin(rotationRadians) + worldY * Math.cos(rotationRadians);
    const x = normalizedX / normalization.scale + normalization.offset.x - fit.translationRaw[0];
    const y = normalizedY / normalization.scale + normalization.offset.y - fit.translationRaw[1];
    const east = (cosine * x + sine * y) / fit.rawUnitsPerMeter;
    const north = (-sine * x + cosine * y) / fit.rawUnitsPerMeter;
    return {
      lat: fit.origin.lat + north / 111_132,
      lon:
        fit.origin.lon +
        east / (111_320 * Math.cos((fit.origin.lat * Math.PI) / 180)),
    };
  };
  return { transform, inverse, metersToWorld: fit.rawUnitsPerMeter * normalization.scale };
};
