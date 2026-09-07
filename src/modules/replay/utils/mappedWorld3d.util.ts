import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  type BufferGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Path,
  type Scene,
  Shape,
} from "three/webgpu";
import type { CircuitSurroundings, MapPoint, MapPolygon } from "../types/circuitSurroundings.types";
import { MAP_COLORS, mapBounds, mapContainsPoint } from "./circuitMapGeometry.util";
import { createMappedGround3D } from "./mappedGround3d.util";

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
  // Distant buildings retain their exact vector footprints without thousands of extrusions.
  for (const building of data.buildings)
    for (const polygon of building.polygons) ground.polygon(polygon, MAP_COLORS.roof, 6);
  const groundMaterials = new Map<string, MeshStandardMaterial>();
  let groundTriangleCount = 0;
  for (const { geometry, color, layer } of ground.finish()) {
    let material = groundMaterials.get(color);
    if (!material) {
      material = new MeshStandardMaterial({
        color,
        roughness: 1,
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
  let buildingCount = 0;
  for (const building of data.buildings)
    for (const polygon of building.polygons) {
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
  const buildingMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  for (const geometries of tiles.values()) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, buildingMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { buildingCount, groundTriangleCount };
};
