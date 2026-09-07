import type { NormalizedPosition } from "./telemetry.util";

// Shared by archived road profiles, mapped terrain, and elevation-dependent scenery.
export const REPLAY_ELEVATION_SCALE_3D = 1.65;

export type TrackPoint3D = { x: number; z: number; y?: number };
export type TrackFrame3D = { point: TrackPoint3D; tangent: TrackPoint3D };

const interpolateTrackPoint3D = (
  a: TrackPoint3D,
  b: TrackPoint3D,
  fraction: number,
): TrackPoint3D => ({
  x: a.x + (b.x - a.x) * fraction,
  z: a.z + (b.z - a.z) * fraction,
  ...(a.y !== undefined || b.y !== undefined
    ? { y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * fraction }
    : {}),
});

const directionCosine = (a: TrackPoint3D, b: TrackPoint3D, c: TrackPoint3D, d: TrackPoint3D) => {
  const ax = b.x - a.x;
  const az = b.z - a.z;
  const bx = d.x - c.x;
  const bz = d.z - c.z;
  const length = Math.hypot(ax, az) * Math.hypot(bx, bz);
  return length ? (ax * bx + az * bz) / length : 1;
};

/** Remove isolated source backtracks while preserving a sustained change in course direction. */
export const cleanTrackPoints3D = (source: TrackPoint3D[], closed: boolean) => {
  const points = [...source];
  if (closed && points.length > 3) {
    const first = points[0];
    const last = points[points.length - 1];
    const before = points[points.length - 2];
    if (
      Math.hypot(before.x - first.x, before.z - first.z) <
        Math.hypot(last.x - first.x, last.z - first.z) * 0.2 &&
      directionCosine(before, last, last, first) < -0.95
    )
      points.pop();
  }
  if (closed || points.length < 4) return points;
  const cleaned = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    const before = cleaned[cleaned.length - 1];
    const point = points[index];
    const after = points[index + 1];
    const next = points[index + 2];
    const previous = cleaned[cleaned.length - 2];
    const reversal = directionCosine(before, point, point, after);
    const isolated =
      previous && next && reversal < -0.965 && directionCosine(previous, before, after, next) > 0.8;
    const entryOvershoot =
      index === 1 &&
      next &&
      reversal < -0.85 &&
      directionCosine(point, after, after, next) > 0.95 &&
      Math.hypot(after.x - before.x, after.z - before.z) <
        Math.hypot(point.x - before.x, point.z - before.z);
    if (!isolated && !entryOvershoot) cleaned.push(point);
  }
  cleaned.push(points[points.length - 1]);
  return cleaned;
};

export const offsetTrackFrame3D = (
  { point, tangent }: TrackFrame3D,
  offset: number,
): TrackPoint3D => {
  const planarLength = Math.hypot(tangent.x, tangent.z) || 1;
  return {
    x: point.x + (tangent.z / planarLength) * offset,
    z: point.z - (tangent.x / planarLength) * offset,
    ...(point.y !== undefined ? { y: point.y } : {}),
  };
};

/** Insert paint boundaries along this kerb's own midline, keeping its existing curve samples. */
export const spaceKerbFrames3D = (
  source: TrackFrame3D[],
  offset: number,
  nominalLength = 0.0048,
) => {
  const midline = source.map((frame) => offsetTrackFrame3D(frame, offset));
  const cumulative = [0];
  for (let index = 1; index < midline.length; index++) {
    cumulative.push(
      cumulative[index - 1] +
        Math.hypot(
          midline[index].x - midline[index - 1].x,
          midline[index].z - midline[index - 1].z,
          (midline[index].y ?? 0) - (midline[index - 1].y ?? 0),
        ),
    );
  }
  const totalLength = cumulative[cumulative.length - 1];
  if (source.length < 2 || totalLength < 1e-10 || nominalLength <= 0) {
    return {
      frames: source,
      blockIndices: source.slice(1).map(() => 0),
      blockCount: 0,
      blockLength: 0,
    };
  }
  // An even count joins the final white block to the first red block without doubling either.
  const blockCount = Math.max(2, Math.round(totalLength / nominalLength / 2) * 2);
  const blockLength = totalLength / blockCount;
  const frames = [source[0]];
  const distances = [0];
  let boundary = 1;
  for (let index = 1; index < source.length; index++) {
    const start = cumulative[index - 1];
    const end = cumulative[index];
    if (end - start < 1e-10) continue;
    while (boundary < blockCount && boundary * blockLength <= end + 1e-10) {
      const distance = boundary * blockLength;
      if (distance > start + 1e-10 && distance < end - 1e-10) {
        const fraction = (distance - start) / (end - start);
        const a = source[index - 1].tangent;
        const b = source[index].tangent;
        const direction = interpolateTrackPoint3D(a, b, fraction);
        const length = Math.hypot(direction.x, direction.y ?? 0, direction.z);
        const tangent =
          length > 1e-10
            ? {
                x: direction.x / length,
                z: direction.z / length,
                ...(direction.y !== undefined ? { y: direction.y / length } : {}),
              }
            : a;
        const middle = interpolateTrackPoint3D(midline[index - 1], midline[index], fraction);
        frames.push({
          point: offsetTrackFrame3D({ point: middle, tangent }, -offset),
          tangent,
        });
        distances.push(distance);
      }
      boundary++;
    }
    frames.push(source[index]);
    distances.push(end);
  }
  const blockIndices = distances
    .slice(1)
    .map((end, index) =>
      Math.min(blockCount - 1, Math.floor((distances[index] + end) / 2 / blockLength)),
    );
  return { frames, blockIndices, blockCount, blockLength };
};

/** Detect sustained corners over a fixed distance, ignoring individual noisy telemetry tangents. */
export const cornerKerbSections3D = (frames: TrackFrame3D[]) => {
  const distances = [0];
  for (let i = 1; i < frames.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          frames[i].point.x - frames[i - 1].point.x,
          frames[i].point.z - frames[i - 1].point.z,
        ),
    );
  const total = distances[distances.length - 1];
  if (frames.length < 3 || total < 0.05) return frames.slice(1).map(() => false);
  const first = frames[0].point;
  const last = frames[frames.length - 1].point;
  const closed = Math.hypot(first.x - last.x, first.z - last.z) < 1e-5;
  const pointAt = (distance: number) => {
    const d = closed
      ? ((distance % total) + total) % total
      : Math.max(0, Math.min(total, distance));
    let low = 0;
    let high = distances.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (distances[middle] < d) low = middle;
      else high = middle;
    }
    return interpolateTrackPoint3D(
      frames[low].point,
      frames[high].point,
      (d - distances[low]) / Math.max(1e-10, distances[high] - distances[low]),
    );
  };
  const turning = (distance: number) => {
    const before = pointAt(distance - 0.025);
    const middle = pointAt(distance);
    const after = pointAt(distance + 0.025);
    return directionCosine(before, middle, middle, after) < Math.cos(0.18);
  };
  // Require a short sustained run, then carry the kerb into entry/exit by about one car length.
  const sustained = (distance: number) =>
    turning(distance - 0.006) && turning(distance) && turning(distance + 0.006);
  return frames.slice(1).map((_, index) => {
    const middle = (distances[index] + distances[index + 1]) / 2;
    return sustained(middle - 0.012) || sustained(middle) || sustained(middle + 0.012);
  });
};

/** Clip offset bands against nearby roads, retaining the valid part of each curved face. */
export const buildTrackRibbon3D = (
  frames: TrackFrame3D[],
  inner: number,
  outer: number,
  height: number,
  allowed: (point: TrackPoint3D) => boolean = () => true,
  visibleSections?: boolean[],
) => {
  const positions: number[] = [];
  const indices: number[] = [];
  const sections: number[] = [];
  for (let index = 0; index < frames.length - 1; index++) {
    if (visibleSections && !visibleSections[index]) continue;
    const points = [
      offsetTrackFrame3D(frames[index], Math.min(inner, outer)),
      offsetTrackFrame3D(frames[index + 1], Math.min(inner, outer)),
      offsetTrackFrame3D(frames[index], Math.max(inner, outer)),
      offsetTrackFrame3D(frames[index + 1], Math.max(inner, outer)),
    ];
    for (const triangle of [
      [0, 1, 2],
      [2, 1, 3],
    ]) {
      const [a, b, c] = triangle.map((vertex) => points[vertex]);
      const upwardArea = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      if (upwardArea <= 1e-12) continue;
      const emit = (triangle: TrackPoint3D[]) => {
        const first = positions.length / 3;
        for (const point of triangle) {
          positions.push(point.x, (point.y ?? 0) + height, point.z);
          sections.push(index);
        }
        indices.push(first, first + 1, first + 2);
      };
      const midpoint = (a: TrackPoint3D, b: TrackPoint3D) => interpolateTrackPoint3D(a, b, 0.5);
      const clip = (a: TrackPoint3D, b: TrackPoint3D, c: TrackPoint3D, depth: number) => {
        const vertices = [a, b, c];
        const inside = vertices.map(allowed);
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        const checks = [ab, bc, ca, interpolateTrackPoint3D(ab, c, 1 / 3)].map(allowed);
        if (inside.every(Boolean) && checks.every(Boolean)) {
          emit(vertices);
          return;
        }
        if (!inside.some(Boolean) && !checks.some(Boolean)) return;
        if (depth < 2) {
          clip(a, ab, ca, depth + 1);
          clip(ab, b, bc, depth + 1);
          clip(ca, bc, c, depth + 1);
          clip(ab, bc, ca, depth + 1);
          return;
        }
        const clipped: TrackPoint3D[] = [];
        for (let edge = 0; edge < 3; edge++) {
          const next = (edge + 1) % 3;
          if (inside[edge]) clipped.push(vertices[edge]);
          if (inside[edge] === inside[next]) continue;
          let accepted = inside[edge] ? vertices[edge] : vertices[next];
          let rejected = inside[edge] ? vertices[next] : vertices[edge];
          for (let step = 0; step < 10; step++) {
            const middle = midpoint(accepted, rejected);
            if (allowed(middle)) accepted = middle;
            else rejected = middle;
          }
          clipped.push(accepted);
        }
        for (let vertex = 1; vertex < clipped.length - 1; vertex++)
          emit([clipped[0], clipped[vertex], clipped[vertex + 1]]);
      };
      clip(a, b, c, 0);
    }
  }
  return { positions, indices, sections };
};

/** Uniform lowering needed to keep a terrain triangle below an overlapping sloped road triangle. */
export const terrainRoadClearance3D = (
  terrain: TrackPoint3D[],
  road: TrackPoint3D[],
  clearance = 0.0003,
) => {
  const cross = (a: TrackPoint3D, b: TrackPoint3D, p: TrackPoint3D) =>
    (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  const area = cross(terrain[0], terrain[1], terrain[2]);
  const roadArea = cross(road[0], road[1], road[2]);
  if (Math.abs(area) < 1e-14 || Math.abs(roadArea) < 1e-14) return 0;
  let polygon = road;
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = terrain[edge];
    const b = terrain[(edge + 1) % 3];
    const clipped: TrackPoint3D[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      const dp = cross(a, b, p) * Math.sign(area);
      const dq = cross(a, b, q) * Math.sign(area);
      if (dp >= 0) clipped.push(p);
      if (dp >= 0 !== dq >= 0) clipped.push(interpolateTrackPoint3D(p, q, dp / (dp - dq)));
    }
    polygon = clipped;
  }
  // The difference between the two height planes is affine, so its maximum occurs at a clipped vertex.
  let lowering = 0;
  for (const point of polygon) {
    const height = terrain.reduce(
      (sum, vertex, i) =>
        sum + ((vertex.y ?? 0) * cross(terrain[(i + 1) % 3], terrain[(i + 2) % 3], point)) / area,
      0,
    );
    lowering = Math.max(lowering, height - (point.y ?? 0) + clearance);
  }
  return lowering > 0 ? lowering + 1e-7 : 0;
};

/** Ignore the normal road/terrain clearance and isolated carved vertices when deciding on a wall. */
export const retainingWallNeeded3D = (
  edgeDrops: number[],
  outsideDrops: number[],
  metersToWorld = 0.0005,
) => {
  const substantialDrop = Math.max(
    0.0015 * REPLAY_ELEVATION_SCALE_3D,
    metersToWorld * REPLAY_ELEVATION_SCALE_3D * 1.5,
  );
  return Math.max(...edgeDrops) > substantialDrop && Math.min(...outsideDrops) > substantialDrop;
};

/** Distance to the actual segments, including the closing segment of a circuit. */
export const distanceToTrack3D = (
  point: TrackPoint3D,
  path: TrackPoint3D[],
  closed = true,
  heightTolerance = Number.POSITIVE_INFINITY,
  excludedProgress?: [number, number],
) => {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.length - (closed ? 0 : 1); index++) {
    const progress = (index + 0.5) / (path.length - 1);
    if (excludedProgress && progress >= excludedProgress[0] && progress <= excludedProgress[1])
      continue;
    const a = path[index];
    const b = path[(index + 1) % path.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared
      ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared))
      : 0;
    if (
      point.y !== undefined &&
      Math.abs(point.y - ((a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t)) > heightTolerance
    )
      continue;
    const offsetX = point.x - a.x - t * dx;
    const offsetZ = point.z - a.z - t * dz;
    minimum = Math.min(minimum, offsetX * offsetX + offsetZ * offsetZ);
  }
  return Math.sqrt(minimum);
};

/** Direction and retained route progress disambiguate the two roads at a crossing. */
export const projectTrackPosition3D = (
  position: TrackPoint3D,
  frames: TrackFrame3D[],
  direction?: TrackPoint3D,
  previousProgress?: number,
  excludedProgress?: [number, number],
) => {
  let bestIndex = -1;
  let bestFraction = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestDistance = 0;
  const directionLength = direction ? Math.hypot(direction.x, direction.z) : 0;
  for (let index = 0; index < frames.length - 1; index++) {
    const segmentProgress = (index + 0.5) / (frames.length - 1);
    if (
      excludedProgress &&
      segmentProgress >= excludedProgress[0] &&
      segmentProgress <= excludedProgress[1]
    )
      continue;
    const a = frames[index].point;
    const b = frames[index + 1].point;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    if (!lengthSquared) continue;
    const fraction = Math.max(
      0,
      Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / lengthSquared),
    );
    const x = a.x + dx * fraction - position.x;
    const z = a.z + dz * fraction - position.z;
    const distance = x * x + z * z;
    const alignment =
      direction && directionLength > 0
        ? (dx * direction.x + dz * direction.z) / (Math.sqrt(lengthSquared) * directionLength)
        : 1;
    const progress = (index + fraction) / (frames.length - 1);
    const progressDelta =
      previousProgress === undefined ? 0 : Math.abs(progress - previousProgress);
    const continuity = Math.min(progressDelta, 1 - progressDelta);
    const score =
      distance + (1 - alignment) ** 2 * 0.00001 + Math.min(continuity / 0.05, 1) ** 2 * 0.00001;
    if (score >= bestScore) continue;
    bestScore = score;
    bestIndex = index;
    bestFraction = fraction;
    bestDistance = Math.sqrt(distance);
  }
  if (bestIndex < 0) return null;
  return {
    point: interpolateTrackPoint3D(
      frames[bestIndex].point,
      frames[bestIndex + 1].point,
      bestFraction,
    ),
    tangent: interpolateTrackPoint3D(
      frames[bestIndex].tangent,
      frames[bestIndex + 1].tangent,
      bestFraction,
    ),
    progress: (bestIndex + bestFraction) / (frames.length - 1),
    distance: bestDistance,
  };
};

/** Test the whole building footprint, so a clear center cannot hide an overhanging roof. */
export const trackFootprintIsClear3D = (
  center: TrackPoint3D,
  angle: number,
  width: number,
  length: number,
  clearance: number,
  distance: (point: TrackPoint3D) => number,
) => {
  const xSteps = Math.max(2, Math.ceil(width / clearance));
  const zSteps = Math.max(2, Math.ceil(length / clearance));
  for (let x = 0; x <= xSteps; x++) {
    for (let z = 0; z <= zSteps; z++) {
      const localX = (x / xSteps - 0.5) * width;
      const localZ = (z / zSteps - 0.5) * length;
      if (
        distance({
          x: center.x + Math.cos(angle) * localX + Math.sin(angle) * localZ,
          z: center.z - Math.sin(angle) * localX + Math.cos(angle) * localZ,
          ...(center.y !== undefined ? { y: center.y } : {}),
        }) < clearance
      )
        return false;
    }
  }
  return true;
};

// The circuit stays level; only the illustrative surrounding countryside has relief.
export const terrainHeight3D = (x: number, z: number, span: number) => {
  const radius = Math.hypot(x, z) / span;
  const rise = Math.max(0, Math.min(1, (radius - 0.85) / 1.5));
  return (
    rise *
    rise *
    span *
    (0.07 + 0.13 * (Math.sin((x / span) * 2.3 + 0.7) * Math.cos((z / span) * 1.8) + 1))
  );
};

export const toTrackPoints3D = (path: NormalizedPosition[], closed = true): TrackPoint3D[] => {
  const points: TrackPoint3D[] = [];
  for (const point of path) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const next = { x: point.x, z: point.y };
    const previous = points.at(-1);
    if (!previous || previous.x !== next.x || previous.z !== next.z) points.push(next);
  }
  if (points.length > 2 && points[0].x === points.at(-1)?.x && points[0].z === points.at(-1)?.z)
    points.pop();
  return cleanTrackPoints3D(points, closed);
};

export const getTrackBounds3D = (points: TrackPoint3D[]) => {
  const xs = points.map(({ x }) => x);
  const zs = points.map(({ z }) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
};

/** Frame-rate independent steering through the shortest angle; seeks use the exact new heading. */
export const smoothTrackAngle3D = (
  current: number,
  target: number,
  seconds: number,
  snap = false,
) => {
  if (snap) return target;
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-14 * Math.max(0, seconds)));
};

export const PIT_BOX_3D = { spacing: 0.009, apronDepth: 0.005, garageDepth: 0.008, height: 0.005 };

/** Choose a coherent row on the straightest usable side of a recorded pit lane. */
export const selectPitBoxRow3D = (
  frames: TrackFrame3D[],
  isClear: (frame: TrackFrame3D, side: number, spacing: number) => boolean,
  maximum = 10,
) => {
  const distances = [0];
  for (let i = 1; i < frames.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          frames[i].point.x - frames[i - 1].point.x,
          frames[i].point.z - frames[i - 1].point.z,
        ),
    );
  const total = distances.at(-1) ?? 0;
  const maximumSpacing = Math.min(PIT_BOX_3D.spacing, Math.max(0.0065, (total * 0.8) / maximum));
  if (total * 0.8 < 0.0065) return [];
  const at = (distance: number) => {
    let i = 0;
    while (i < distances.length - 2 && distances[i + 1] < distance) i++;
    const fraction = (distance - distances[i]) / Math.max(1e-10, distances[i + 1] - distances[i]);
    return {
      point: interpolateTrackPoint3D(frames[i].point, frames[i + 1].point, fraction),
      tangent: interpolateTrackPoint3D(frames[i].tangent, frames[i + 1].tangent, fraction),
    };
  };
  let best: Array<TrackFrame3D & { side: number; spacing: number }> = [];
  let bestScore = -Infinity;
  for (const spacing of new Set([
    maximumSpacing,
    Math.min(maximumSpacing, 0.0075),
    Math.min(maximumSpacing, 0.0065),
  ])) {
    const count = Math.min(maximum, Math.floor((total * 0.8) / spacing + 1e-8));
    for (const side of [-1, 1])
      for (let candidate = 0; candidate <= 40; candidate++) {
        const start = total * 0.1 + ((total * 0.8 - count * spacing) * candidate) / 40;
        const row: Array<TrackFrame3D & { side: number; spacing: number }> = [];
        let bend = 0;
        for (let slot = 0; slot < count; slot++) {
          const distance = start + (slot + 0.5) * spacing;
          const frame = at(distance);
          const before = at(distance - spacing / 2).point;
          const after = at(distance + spacing / 2).point;
          const straight = directionCosine(before, frame.point, frame.point, after);
          if (straight < 0.98 || !isClear(frame, side, spacing)) continue;
          if (row.length)
            bend +=
              1 -
              directionCosine(
                { x: 0, z: 0 },
                row[row.length - 1].tangent,
                { x: 0, z: 0 },
                frame.tangent,
              );
          row.push({ ...frame, side, spacing });
        }
        const score = row.length - bend + spacing * 10;
        if (score > bestScore) {
          bestScore = score;
          best = row;
        }
      }
  }
  return best;
};
