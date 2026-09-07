import type { MapPoint, MapPolygon } from "../types/circuitSurroundings.types";

export const mapBounds = (points: MapPoint[]) => ({
  minX: Math.min(...points.map((p) => p[0])),
  maxX: Math.max(...points.map((p) => p[0])),
  minY: Math.min(...points.map((p) => p[1])),
  maxY: Math.max(...points.map((p) => p[1])),
});

export const mapContainsPoint = (point: MapPoint, polygon: MapPolygon) => {
  const inRing = (ring: MapPoint[]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  };
  return !!polygon.length && inRing(polygon[0]) && !polygon.slice(1).some(inRing);
};

export const mapPolygonPath = (polygon: MapPolygon, scale = 1000) =>
  polygon
    .map(
      (ring) =>
        `${ring
          .map(
            (point, i) =>
              `${i ? "L" : "M"}${(point[0] * scale).toFixed(2)},${(point[1] * scale).toFixed(2)}`,
          )
          .join(" ")}Z`,
    )
    .join(" ");

export const MAP_COLORS = {
  ground: "#657564",
  grass: "#728168",
  wood: "#435f50",
  water: "#456f80",
  paved: "#8d928b",
  parking: "#777f7d",
  road: "#a0a39a",
  building: "#c4c9bd",
  roof: "#d5d8ce",
};

/** Bilinear sampling of the cached sea-level elevation grid in replay coordinates. */
export const sampleMapTerrain = (
  terrain: import("../types/circuitSurroundings.types").CircuitSurroundings["terrain"],
  point: MapPoint,
) => {
  if (!terrain || terrain.width < 2 || terrain.height < 2) return undefined;
  const [minX, minY, maxX, maxY] = terrain.bounds;
  if (point[0] < minX || point[0] > maxX || point[1] < minY || point[1] > maxY) return undefined;
  const x = ((point[0] - minX) / (maxX - minX)) * (terrain.width - 1),
    y = ((point[1] - minY) / (maxY - minY)) * (terrain.height - 1);
  const ix = Math.min(Math.floor(x), terrain.width - 2),
    iy = Math.min(Math.floor(y), terrain.height - 2);
  const tx = x - ix,
    ty = y - iy;
  const [a, b, c, d] = [
    terrain.heights[iy * terrain.width + ix],
    terrain.heights[iy * terrain.width + ix + 1],
    terrain.heights[(iy + 1) * terrain.width + ix],
    terrain.heights[(iy + 1) * terrain.width + ix + 1],
  ];
  if (![a, b, c, d].every(Number.isFinite)) return undefined;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
};

/** Visible SVG coordinates for the full screen, without changing the track's existing transform. */
export const mapScreenBounds2D = (
  matrix: { a: number; b: number; c: number; d: number; e: number; f: number },
  width: number,
  height: number,
) => {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-12) return undefined;
  const points: MapPoint[] = [];
  for (const x of [0, width])
    for (const y of [0, height]) {
      const dx = x - matrix.e,
        dy = y - matrix.f;
      points.push([
        (matrix.d * dx - matrix.c * dy) / determinant,
        (-matrix.b * dx + matrix.a * dy) / determinant,
      ]);
    }
  const bounds = mapBounds(points);
  return { ...bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
};
