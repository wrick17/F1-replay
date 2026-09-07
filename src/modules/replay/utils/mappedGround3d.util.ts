import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three/webgpu";
import type { MapPoint, MapPolygon } from "../types/circuitSurroundings.types";

/** Clip a convex polygon against a half-plane. Positive distances are inside. */
const clip = (points: MapPoint[], distance: (point: MapPoint) => number): MapPoint[] => {
  if (!points.length) return points;
  const result: MapPoint[] = [];
  let previous = points[points.length - 1],
    before = distance(previous);
  for (const point of points) {
    const after = distance(point);
    if (before < 0 !== after < 0) {
      const t = before / (before - after);
      result.push([
        previous[0] + (point[0] - previous[0]) * t,
        previous[1] + (point[1] - previous[1]) * t,
      ]);
    }
    if (after >= 0) result.push(point);
    previous = point;
    before = after;
  }
  return result;
};

/** Batch vector features, split at every underlying terrain edge so no face cuts a hill. */
export const createMappedGround3D = (
  ground: BufferGeometry,
  grid: number[],
  center: { x: number; z: number },
  tileSize: number,
) => {
  const terrain = ground.getAttribute("position"),
    normals = ground.getAttribute("normal");
  const n = grid.length;
  // Use the actual Float32 terrain coordinates, including their rounding, for seam-free clipping.
  const xs = grid.map((_, i) => terrain.getX(i) + center.x);
  const zs = grid.map((_, i) => terrain.getZ(i * n) + center.z);
  const cell = (axis: number[], value: number) => {
    let low = 0,
      high = axis.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (value < axis[middle]) high = middle;
      else low = middle;
    }
    return low;
  };
  const batches = new Map<
    string,
    { layer: number; color: string; position: number[]; normal: number[] }
  >();
  const triangle = (points: MapPoint[], color: string, layer: number) => {
    const minZ = Math.min(...points.map((p) => p[1])),
      maxZ = Math.max(...points.map((p) => p[1]));
    if (maxZ < zs[0] || minZ > zs[n - 1]) return;
    const endZ = cell(zs, maxZ);
    for (let iz = cell(zs, minZ); iz <= endZ; iz++) {
      const row = clip(
        clip(points, (p) => p[1] - zs[iz]),
        (p) => zs[iz + 1] - p[1],
      );
      if (row.length < 3) continue;
      const minX = Math.min(...row.map((p) => p[0])),
        maxX = Math.max(...row.map((p) => p[0]));
      if (maxX < xs[0] || minX > xs[n - 1]) continue;
      const endX = cell(xs, maxX);
      for (let ix = cell(xs, minX); ix <= endX; ix++) {
        const square = clip(
          clip(row, (p) => p[0] - xs[ix]),
          (p) => xs[ix + 1] - p[0],
        );
        if (square.length < 3) continue;
        const width = xs[ix + 1] - xs[ix],
          depth = zs[iz + 1] - zs[iz];
        const diagonal = (p: MapPoint) => 1 - (p[0] - xs[ix]) / width - (p[1] - zs[iz]) / depth;
        const a = iz * n + ix,
          b = a + n,
          c = b + 1,
          d = a + 1;
        for (let side = 0; side < 2; side++) {
          const piece = clip(square, (p) => (side ? -1 : 1) * diagonal(p));
          if (piece.length < 3) continue;
          const key = `${layer}:${color}:${Math.floor(piece[0][0] / tileSize)}:${Math.floor(piece[0][1] / tileSize)}`;
          let batch = batches.get(key);
          if (!batch) {
            batch = { layer, color, position: [], normal: [] };
            batches.set(key, batch);
          }
          const indices = side ? [c, b, d] : [a, d, b];
          const vertex = (p: MapPoint) => {
            const fx = (p[0] - xs[ix]) / width,
              fz = (p[1] - zs[iz]) / depth;
            const weights = side ? [fx + fz - 1, 1 - fx, 1 - fz] : [1 - fx - fz, fx, fz];
            let y = 0,
              nx = 0,
              ny = 0,
              nz = 0;
            for (let j = 0; j < 3; j++) {
              const index = indices[j],
                weight = weights[j];
              y += terrain.getY(index) * weight;
              nx += normals.getX(index) * weight;
              ny += normals.getY(index) * weight;
              nz += normals.getZ(index) * weight;
            }
            // Ground decals share the exact terrain plane; material depth bias and render order layer them.
            batch.position.push(p[0], y, p[1]);
            batch.normal.push(nx, ny, nz);
          };
          for (let i = 1; i < piece.length - 1; i++) {
            const p = piece[0],
              q = piece[i],
              r = piece[i + 1];
            const signedArea = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
            if (Math.abs(signedArea) < 1e-15) continue;
            vertex(p);
            vertex(signedArea < 0 ? q : r);
            vertex(signedArea < 0 ? r : q);
          }
        }
      }
    }
  };
  const polygon = (polygon: MapPolygon, color: string, layer: number) => {
    if (!polygon.length || polygon[0].length < 3) return;
    const rings = polygon.map((ring) => ring.map(([x, z]) => new Vector2(x, z)));
    // Three's triangulator removes duplicate closing points in place, before flattening.
    const faces = ShapeUtils.triangulateShape(rings[0], rings.slice(1));
    const points: MapPoint[] = rings.flat().map((p) => [p.x, p.y]);
    for (const face of faces)
      triangle(
        face.map((i) => points[i]),
        color,
        layer,
      );
  };
  const road = (points: MapPoint[], width: number, color: string, layer: number) => {
    if (points.length < 2 || width <= 0) return;
    const radius = width / 2;
    const arc = (point: MapPoint, start: number, sweep: number) => {
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 4)));
      for (let i = 0; i < steps; i++) {
        const angleA = start + (sweep * i) / steps,
          angleB = start + (sweep * (i + 1)) / steps;
        triangle(
          [
            point,
            [point[0] + Math.cos(angleA) * radius, point[1] + Math.sin(angleA) * radius],
            [point[0] + Math.cos(angleB) * radius, point[1] + Math.sin(angleB) * radius],
          ],
          color,
          layer,
        );
      }
    };
    let previousAngle: number | undefined, lastPoint: MapPoint | undefined;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1],
        q = points[i],
        dx = q[0] - p[0],
        dz = q[1] - p[1];
      const length = Math.hypot(dx, dz);
      if (length < 1e-10) continue;
      const angle = Math.atan2(dz, dx),
        nx = (-dz / length) * radius,
        nz = (dx / length) * radius;
      const a: MapPoint = [p[0] + nx, p[1] + nz],
        b: MapPoint = [p[0] - nx, p[1] - nz];
      const c: MapPoint = [q[0] - nx, q[1] - nz],
        d: MapPoint = [q[0] + nx, q[1] + nz];
      triangle([a, b, c], color, layer);
      triangle([a, c, d], color, layer);
      if (previousAngle === undefined) arc(p, angle + Math.PI / 2, Math.PI);
      else {
        const turn = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle));
        if (Math.abs(turn) > 1e-5)
          arc(p, previousAngle + ((turn > 0 ? -1 : 1) * Math.PI) / 2, turn);
      }
      previousAngle = angle;
      lastPoint = q;
    }
    if (lastPoint && previousAngle !== undefined)
      arc(lastPoint, previousAngle - Math.PI / 2, Math.PI);
  };
  const finish = () => {
    const result = [];
    for (const batch of batches.values()) {
      if (!batch.position.length) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(batch.position, 3));
      geometry.setAttribute("normal", new Float32BufferAttribute(batch.normal, 3));
      geometry.computeBoundingSphere();
      result.push({ geometry, color: batch.color, layer: batch.layer });
    }
    batches.clear();
    return result;
  };
  return { polygon, road, finish };
};
