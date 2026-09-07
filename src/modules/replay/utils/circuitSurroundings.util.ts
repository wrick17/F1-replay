import type { CircuitSurroundings } from "../types/circuitSurroundings.types";

/** Fail closed before externally generated coordinates reach SVG or GPU buffers. */
export const validateCircuitSurroundings = (value: unknown): CircuitSurroundings => {
  const fail = () => {
    throw new Error("Invalid circuit surroundings");
  };
  if (!value || typeof value !== "object") return fail();
  const data = value as CircuitSurroundings;
  const finite = (n: unknown, limit = 100) =>
    typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= limit;
  let vertices = 0;
  const line = (points: unknown, minimum: number): boolean =>
    Array.isArray(points) &&
    points.length >= minimum &&
    points.every((p) => {
      vertices++;
      return vertices <= 500_000 && Array.isArray(p) && p.length === 2 && p.every((n) => finite(n));
    });
  const polygon = (rings: unknown): boolean =>
    Array.isArray(rings) && rings.length > 0 && rings.every((r) => line(r, 3));
  const polygons = (items: unknown): boolean =>
    Array.isArray(items) && items.length > 0 && items.every(polygon);
  if (
    data.schemaVersion !== 1 ||
    !Number.isSafeInteger(data.circuitKey) ||
    data.circuitKey < 1 ||
    !finite(data.metersToWorld, 1) ||
    data.metersToWorld <= 0 ||
    !data.geometry ||
    !/^[a-f0-9]{64}$/.test(data.geometry.sha256) ||
    !Array.isArray(data.geometry.anchors) ||
    data.geometry.anchors.length < 12 ||
    !data.geometry.anchors.every(
      (p) => Array.isArray(p) && p.length === 3 && p.every((n) => finite(n)),
    ) ||
    !finite(data.geometry.referencePlanarLengthRaw, 1e8) ||
    data.geometry.referencePlanarLengthRaw <= 0 ||
    !data.source ||
    !Number.isFinite(Date.parse(data.source.snapshotAt)) ||
    typeof data.source.attribution !== "string" ||
    typeof data.source.url !== "string" ||
    !polygon(data.coverage)
  )
    return fail();
  for (const items of [data.buildings, data.roads, data.areas]) {
    if (!Array.isArray(items) || items.length > 30_000) return fail();
    for (const item of items) if (!item || typeof item.id !== "string") return fail();
  }
  if (
    !data.buildings.every(
      (b) =>
        polygons(b.polygons) &&
        [b.heightM, b.minHeightM, b.levels].every(
          (n) => n === undefined || (finite(n, 1000) && n >= 0),
        ),
    ) ||
    !data.roads.every(
      (r) =>
        line(r.points, 2) &&
        typeof r.kind === "string" &&
        (r.widthM === undefined || (finite(r.widthM, 100) && r.widthM > 0)) &&
        (r.layer === undefined || finite(r.layer, 20)),
    ) ||
    !data.areas.every(
      (a) =>
        polygons(a.polygons) && ["water", "wood", "grass", "paved", "parking"].includes(a.kind),
    )
  )
    return fail();
  const terrain = data.terrain;
  if (
    terrain &&
    (!Number.isInteger(terrain.width) ||
      !Number.isInteger(terrain.height) ||
      terrain.width < 2 ||
      terrain.height < 2 ||
      terrain.width > 513 ||
      terrain.height > 513 ||
      !Array.isArray(terrain.bounds) ||
      terrain.bounds.length !== 4 ||
      !terrain.bounds.every((n) => finite(n)) ||
      terrain.bounds[0] >= terrain.bounds[2] ||
      terrain.bounds[1] >= terrain.bounds[3] ||
      !Array.isArray(terrain.heights) ||
      terrain.heights.length !== terrain.width * terrain.height ||
      !terrain.heights.every((n) => finite(n, 10_000)) ||
      !terrain.source ||
      typeof terrain.source.attribution !== "string" ||
      typeof terrain.source.url !== "string" ||
      typeof terrain.source.license !== "string")
  )
    return fail();
  return data;
};
