import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  PointLight,
  type Scene,
  Shape,
} from "three/webgpu";
import type { CircuitSurroundings, MapPoint, MapPolygon } from "../types/circuitSurroundings.types";
import { MAP_COLORS, mapBounds, mapContainsPoint } from "./circuitMapGeometry.util";
import { createMappedGround3D } from "./mappedGround3d.util";
import { createReplayWaterTexture3D, replayWorldUvs3D } from "./replayMaterials3d.util";

/** Extrude the mapped footprint, preserving courtyards and geographic X/Y exactly. */
export const mappedBuildingGeometry3D = (polygon: MapPolygon, bottom: number, top: number) => {
  const shape = new Shape();
  const trace = (path: Shape | Path, ring: MapPoint[]) => {
    ring.forEach(([x, y], i) => {
      if (i) path.lineTo(x, -y);
      else path.moveTo(x, -y);
    });
    path.closePath();
  };
  trace(shape, polygon[0]);
  for (const ring of polygon.slice(1)) {
    const hole = new Path();
    trace(hole, ring);
    shape.holes.push(hole);
  }
  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, top - bottom),
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  return geometry;
};

const pointSegmentDistanceSquared3D = (point: MapPoint, start: MapPoint, end: MapPoint) => {
  const dx = end[0] - start[0],
    dz = end[1] - start[1],
    lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  const progress = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared),
  );
  return (point[0] - start[0] - progress * dx) ** 2 + (point[1] - start[1] - progress * dz) ** 2;
};

const segmentDistanceSquared3D = (a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) => {
  const cross = (p: MapPoint, q: MapPoint, r: MapPoint) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b),
    epsilon = 1e-12;
  const opposite = (first: number, second: number) =>
    (first > epsilon && second < -epsilon) || (first < -epsilon && second > epsilon);
  const onSegment = (start: MapPoint, point: MapPoint, end: MapPoint, orientation: number) =>
    Math.abs(orientation) <= epsilon &&
    point[0] >= Math.min(start[0], end[0]) - epsilon &&
    point[0] <= Math.max(start[0], end[0]) + epsilon &&
    point[1] >= Math.min(start[1], end[1]) - epsilon &&
    point[1] <= Math.max(start[1], end[1]) + epsilon;
  if (
    (opposite(abC, abD) && opposite(cdA, cdB)) ||
    onSegment(a, c, b, abC) ||
    onSegment(a, d, b, abD) ||
    onSegment(c, a, d, cdA) ||
    onSegment(c, b, d, cdB)
  )
    return 0;
  return Math.min(
    pointSegmentDistanceSquared3D(a, c, d),
    pointSegmentDistanceSquared3D(b, c, d),
    pointSegmentDistanceSquared3D(c, a, b),
    pointSegmentDistanceSquared3D(d, a, b),
  );
};

export const mappedBuildingBlocksCircuit3D = (
  building: CircuitSurroundings["buildings"][number],
  polygon: MapPolygon,
  circuitPaths: readonly (readonly { x: number; z: number }[])[],
  roadHalfWidth: number,
) => {
  if ((building.minHeightM ?? 0) > 0) return false;
  const bounds = mapBounds(polygon[0]),
    maximumDistanceSquared = roadHalfWidth * roadHalfWidth;
  for (const path of circuitPaths)
    for (let index = 1; index < path.length; index++) {
      const start = path[index - 1],
        end = path[index];
      if (
        Math.max(start.x, end.x) < bounds.minX - roadHalfWidth ||
        Math.min(start.x, end.x) > bounds.maxX + roadHalfWidth ||
        Math.max(start.z, end.z) < bounds.minY - roadHalfWidth ||
        Math.min(start.z, end.z) > bounds.maxY + roadHalfWidth
      )
        continue;
      if (mapContainsPoint([start.x, start.z], polygon)) return true;
      const trackStart: MapPoint = [start.x, start.z],
        trackEnd: MapPoint = [end.x, end.z];
      for (const ring of polygon)
        for (let edge = 0; edge < ring.length; edge++)
          if (
            segmentDistanceSquared3D(
              trackStart,
              trackEnd,
              ring[edge],
              ring[(edge + 1) % ring.length],
            ) <= maximumDistanceSquared
          )
            return true;
    }
  return false;
};

/** Exact extrema of the piecewise planar terrain inside a footprint, excluding courtyards. */
export const mappedFoundation3D = (
  polygon: MapPolygon,
  grid: number[],
  geometry: BufferGeometry,
  center: { x: number; z: number },
  terrainY: (x: number, z: number) => number,
) => {
  const positions = geometry.getAttribute("position");
  const bounds = mapBounds(polygon[0]);
  let floor = -Infinity,
    bottom = Infinity;
  const include = (height: number) => {
    floor = Math.max(floor, height);
    bottom = Math.min(bottom, height);
  };
  for (const ring of polygon) for (const [x, z] of ring) include(terrainY(x, z));
  const xs: number[] = [],
    zs: number[] = [];
  for (let i = 0; i < grid.length - 1; i++) {
    if (grid[i] + center.x <= bounds.maxX && grid[i + 1] + center.x >= bounds.minX) xs.push(i);
    if (grid[i] + center.z <= bounds.maxY && grid[i + 1] + center.z >= bounds.minY) zs.push(i);
  }
  for (const iz of zs)
    for (const ix of xs) {
      const a = iz * grid.length + ix,
        b = a + grid.length,
        c = b + 1,
        d = a + 1;
      for (const index of [a, b, c, d]) {
        if (
          mapContainsPoint(
            [positions.getX(index) + center.x, positions.getZ(index) + center.z],
            polygon,
          )
        )
          include(positions.getY(index));
      }
      // Extrema also occur where a footprint boundary crosses a terrain triangle edge.
      for (const [start, end] of [
        [a, b],
        [b, c],
        [c, d],
        [d, a],
        [b, d],
      ]) {
        const x = positions.getX(start) + center.x,
          z = positions.getZ(start) + center.z;
        const dx = positions.getX(end) - positions.getX(start),
          dz = positions.getZ(end) - positions.getZ(start);
        for (const ring of polygon)
          for (let i = 0; i < ring.length; i++) {
            const p = ring[i],
              q = ring[(i + 1) % ring.length],
              ex = q[0] - p[0],
              ez = q[1] - p[1];
            const determinant = dx * ez - dz * ex;
            if (Math.abs(determinant) < 1e-14) continue;
            const t = ((p[0] - x) * ez - (p[1] - z) * ex) / determinant;
            const u = ((p[0] - x) * dz - (p[1] - z) * dx) / determinant;
            if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
              include(positions.getY(start) + (positions.getY(end) - positions.getY(start)) * t);
          }
      }
    }
  return { floor, bottom };
};

export const createMappedWorld3D = (
  scene: Scene,
  data: CircuitSurroundings,
  groundGeometry: BufferGeometry,
  center: { x: number; z: number },
  terrainY: (x: number, z: number) => number,
  circuitDistance: (point: { x: number; z: number }) => number,
  roadHalfWidth: number,
  grid: number[],
  span: number,
  maxStreetLights = 768,
  circuitPaths: readonly (readonly { x: number; z: number }[])[] = [],
) => {
  const ground = createMappedGround3D(groundGeometry, grid, center, span * 0.75);
  const kinds = ["grass", "wood", "paved", "parking", "water"] as const;
  for (const area of data.areas)
    for (const polygon of area.polygons)
      ground.polygon(polygon, MAP_COLORS[area.kind], kinds.indexOf(area.kind));
  for (const road of data.roads) {
    if (road.tunnel) continue;
    const color = road.kind === "footway" || road.kind === "path" ? "#87937e" : "#4a514f";
    let points: MapPoint[] = [];
    const flush = () => {
      ground.road(points, (road.widthM ?? 5) * data.metersToWorld, color, 5);
      points = [];
    };
    for (const point of road.points) {
      // The archive remains the circuit authority; nearby raceway ways must not widen it.
      if (
        road.kind === "raceway" &&
        circuitDistance({ x: point[0], z: point[1] }) < roadHalfWidth + 3 * data.metersToWorld
      )
        flush();
      else points.push(point);
    }
    flush();
  }
  const visibleBuildingPolygons = data.buildings.flatMap((building) =>
    building.polygons
      .filter(
        (polygon) => !mappedBuildingBlocksCircuit3D(building, polygon, circuitPaths, roadHalfWidth),
      )
      .map((polygon) => ({ building, polygon })),
  );
  // Distant buildings retain their exact vector footprints without thousands of extrusions.
  for (const { polygon } of visibleBuildingPolygons) ground.polygon(polygon, MAP_COLORS.roof, 6);
  const groundMaterials = new Map<string, MeshStandardMaterial>();
  let groundTriangleCount = 0,
    waterTexture: ReturnType<typeof createReplayWaterTexture3D> | undefined;
  for (const { geometry, color, layer } of ground.finish()) {
    const isWater = color === MAP_COLORS.water;
    if (isWater) {
      waterTexture ??= createReplayWaterTexture3D();
      geometry.setAttribute(
        "uv",
        new Float32BufferAttribute(
          replayWorldUvs3D(geometry.getAttribute("position").array, 24),
          2,
        ),
      );
    }
    let material = groundMaterials.get(color);
    if (!material) {
      material = new MeshStandardMaterial({
        color,
        roughness: isWater ? 0.42 : 1,
        metalness: 0,
        bumpMap: isWater ? waterTexture : null,
        bumpScale: isWater ? 0.00012 : 1,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      groundMaterials.set(color, material);
    }
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = layer + 1;
    scene.add(mesh);
    groundTriangleCount += geometry.getAttribute("position").count / 3;
  }

  const tiles = new Map<string, BufferGeometry[]>();
  const wallColor = new Color(MAP_COLORS.building),
    roofColor = new Color(MAP_COLORS.roof);
  const windowPositions: number[] = [],
    windowColors: number[] = [];
  const windowPalette = [new Color(0xffd58a), new Color(0xd9efff), new Color(0xffedc2)];
  const nearbyBuildingCount = visibleBuildingPolygons.filter(({ polygon }) => {
    const bounds = mapBounds(polygon[0]);
    return (
      Math.abs((bounds.minX + bounds.maxX) / 2 - center.x) <= span * 1.05 &&
      Math.abs((bounds.minY + bounds.maxY) / 2 - center.z) <= span * 1.05
    );
  }).length;
  // ponytail: one batched mesh shares 20,000 windows across nearby buildings.
  const windowBudget = Math.min(80, Math.max(2, Math.floor(20_000 / nearbyBuildingCount)));
  let buildingCount = 0;
  for (const { building, polygon } of visibleBuildingPolygons) {
    if (polygon[0].length < 3) continue;
    const footprint = mapBounds(polygon[0]);
    const x = (footprint.minX + footprint.maxX) / 2,
      z = (footprint.minY + footprint.maxY) / 2;
    if (Math.abs(x - center.x) > span * 1.05 || Math.abs(z - center.z) > span * 1.05) continue;
    const { floor, bottom } = mappedFoundation3D(polygon, grid, groundGeometry, center, terrainY);
    const height =
      (building.heightM ?? (building.levels ? building.levels * 3 : 6)) * data.metersToWorld;
    const minHeight = Math.max(0, building.minHeightM ?? 0) * data.metersToWorld;
    const geometry = mappedBuildingGeometry3D(
      polygon,
      minHeight ? floor + minHeight : bottom,
      floor + Math.max(height, minHeight + data.metersToWorld),
    );
    const buildingBottom = minHeight ? floor + minHeight : bottom,
      buildingTop = floor + Math.max(height, minHeight + data.metersToWorld),
      ring = polygon[0],
      area = ring.reduce((sum, point, index) => {
        const next = ring[(index + 1) % ring.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0);
    for (let edge = 0; edge < ring.length; edge++) {
      const start = ring[edge],
        end = ring[(edge + 1) % ring.length],
        dx = end[0] - start[0],
        dz = end[1] - start[1],
        length = Math.hypot(dx, dz),
        columns = Math.min(40, Math.floor(length / (3.2 * data.metersToWorld))),
        rows = Math.min(20, Math.floor((buildingTop - buildingBottom) / (3 * data.metersToWorld)));
      if (!columns || !rows) continue;
      const edgeBudget = Math.floor((windowBudget + ring.length - 1 - edge) / ring.length),
        ux = dx / length,
        uz = dz / length,
        outward = area >= 0 ? 1 : -1,
        nx = (outward * dz) / length,
        nz = (-outward * dx) / length,
        width = Math.min(1.6 * data.metersToWorld, (length / columns) * 0.52),
        height = 1.35 * data.metersToWorld;
      for (let slot = 0; slot < edgeBudget; slot++) {
        const column = Math.floor(((slot + 0.5) / edgeBudget) * columns),
          row = (buildingCount + edge + slot * 3) % rows,
          along = ((column + 0.5) / columns) * length,
          x = start[0] + ux * along + nx * data.metersToWorld * 0.05,
          z = start[1] + uz * along + nz * data.metersToWorld * 0.05,
          y = buildingBottom + (row + 0.58) * 3 * data.metersToWorld,
          halfWidth = width / 2,
          halfHeight = height / 2;
        if (y + halfHeight >= buildingTop) continue;
        for (const [side, vertical] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ])
          windowPositions.push(
            x + ux * halfWidth * side,
            y + halfHeight * vertical,
            z + uz * halfWidth * side,
          );
        const color = windowPalette[(buildingCount + edge + row + column) % windowPalette.length];
        for (let vertex = 0; vertex < 6; vertex++) windowColors.push(color.r, color.g, color.b);
      }
    }
    const normals = geometry.getAttribute("normal");
    const colors = [];
    for (let i = 0; i < normals.count; i++) {
      const color = normals.getY(i) > 0.5 ? roofColor : wallColor;
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    const key = `${Math.floor(x / 0.3)}:${Math.floor(z / 0.3)}`;
    const group = tiles.get(key) ?? [];
    group.push(geometry);
    tiles.set(key, group);
    buildingCount++;
  }
  const buildingMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    emissive: 0x192a35,
    emissiveIntensity: 0,
  });
  for (const geometries of tiles.values()) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, buildingMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  let windowMaterial: MeshBasicMaterial | null = null;
  if (windowPositions.length) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(windowPositions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(windowColors, 3));
    windowMaterial = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    });
    const windows = new Mesh(geometry, windowMaterial);
    scene.add(windows);
  }

  const excludedRoads = new Set([
    "construction",
    "corridor",
    "cycleway",
    "elevator",
    "footway",
    "path",
    "pedestrian",
    "platform",
    "raceway",
    "steps",
    "track",
  ]);
  const streetLightCandidates: Array<{ x: number; y: number; z: number; angle: number }> = [];
  for (const road of data.roads) {
    if (road.tunnel || road.bridge || excludedRoads.has(road.kind)) continue;
    let remaining = 14 * data.metersToWorld;
    for (let index = 1; index < road.points.length; index++) {
      const start = road.points[index - 1],
        end = road.points[index],
        dx = end[0] - start[0],
        dz = end[1] - start[1],
        length = Math.hypot(dx, dz);
      if (!length) continue;
      while (remaining <= length) {
        const fraction = remaining / length,
          side = streetLightCandidates.length % 2 ? -1 : 1,
          offset = ((road.widthM ?? 5) / 2 + 0.8) * data.metersToWorld,
          x = start[0] + dx * fraction + (side * dz * offset) / length,
          z = start[1] + dz * fraction - (side * dx * offset) / length;
        if (
          Math.abs(x - center.x) <= span * 1.05 &&
          Math.abs(z - center.z) <= span * 1.05 &&
          circuitDistance({ x, z }) > roadHalfWidth + 5 * data.metersToWorld
        )
          streetLightCandidates.push({ x, y: terrainY(x, z), z, angle: Math.atan2(dx, dz) });
        remaining += 28 * data.metersToWorld;
      }
      remaining -= length;
    }
  }
  const cells = new Map<string, typeof streetLightCandidates>();
  for (const light of streetLightCandidates) {
    const cellSize = span / 12,
      key = `${Math.floor((light.x - center.x) / cellSize)}:${Math.floor((light.z - center.z) / cellSize)}`,
      cell = cells.get(key) ?? [];
    cell.push(light);
    cells.set(key, cell);
  }
  const streetLights: typeof streetLightCandidates = [];
  // ponytail: share the clustered-light budget evenly across the mapped area.
  for (let round = 0; streetLights.length < maxStreetLights; round++) {
    let added = false;
    for (const cell of cells.values()) {
      if (!cell[round]) continue;
      streetLights.push(cell[round]);
      added = true;
      if (streetLights.length === maxStreetLights) break;
    }
    if (!added) break;
  }
  let cityLampMaterial: MeshStandardMaterial | null = null;
  const cityLights: PointLight[] = [];
  if (streetLights.length) {
    const poleHeight = 7 * data.metersToWorld,
      poleMaterial = new MeshStandardMaterial({ color: 0x4f5558, roughness: 0.5, metalness: 0.7 });
    cityLampMaterial = new MeshStandardMaterial({
      color: 0xffefc9,
      emissive: 0xffc86b,
      emissiveIntensity: 0,
    });
    const poles = new InstancedMesh(
        new CylinderGeometry(0.1 * data.metersToWorld, 0.14 * data.metersToWorld, poleHeight, 5),
        poleMaterial,
        streetLights.length,
      ),
      lamps = new InstancedMesh(
        new BoxGeometry(
          0.8 * data.metersToWorld,
          0.25 * data.metersToWorld,
          0.45 * data.metersToWorld,
        ),
        cityLampMaterial,
        streetLights.length,
      ),
      transform = new Object3D();
    streetLights.forEach((light, index) => {
      transform.position.set(light.x, light.y + poleHeight / 2, light.z);
      transform.rotation.set(0, light.angle, 0);
      transform.updateMatrix();
      poles.setMatrixAt(index, transform.matrix);
      transform.position.y = light.y + poleHeight;
      transform.updateMatrix();
      lamps.setMatrixAt(index, transform.matrix);
      const distance = 18 * data.metersToWorld;
      const pointLight = new PointLight(0xffd58a, 0, distance, 2);
      pointLight.position.copy(transform.position);
      pointLight.userData.nightIntensity = 0.0018;
      cityLights.push(pointLight);
    });
    scene.add(poles, lamps, ...cityLights);
  }
  return {
    buildingCount,
    groundTriangleCount,
    buildingMaterial,
    windowCount: windowPositions.length / 18,
    windowMaterial,
    streetLightCount: streetLights.length,
    cityLampMaterial,
    cityLights,
    dispose: () => waterTexture?.dispose(),
  };
};
