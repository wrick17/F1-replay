import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
  dot,
  Fn,
  float,
  floor,
  fog as fogNode,
  fract,
  max,
  min,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  rangeFogFactor,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  type CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  MeshStandardMaterial,
  NearestFilter,
  type Node,
  Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  type Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type WebGPURenderer,
} from "three/webgpu";
import type { CircuitSurroundings } from "../types/circuitSurroundings.types";
import { mapBounds, mapContainsPoint, sampleMapTerrain } from "./circuitMapGeometry.util";
import { createMappedWorld3D } from "./mappedWorld3d.util";
import type { ReplayBridge3D } from "./replayElevation3d.util";
import type { ReplayEnvironment } from "./replayEnvironment.util";
import {
  buildTrackRibbon3D,
  cornerKerbSections3D,
  distanceToTrack3D,
  offsetTrackFrame3D,
  PIT_BOX_3D,
  projectTrackPosition3D,
  REPLAY_ELEVATION_SCALE_3D,
  retainingWallNeeded3D,
  selectPitBoxRow3D,
  spaceKerbFrames3D,
  type TrackPoint3D,
  terrainHeight3D,
  terrainRoadClearance3D,
  trackFootprintIsClear3D,
} from "./track3d.util";

const roadHalfWidth = 0.0045;
const roadScale = roadHalfWidth / 0.013;
const kerbOuter = 0.0154 * roadScale;
const runoffOuter = 0.017 * roadScale;
const gravelOuter = 0.021 * roadScale;
const barrierOffset = 0.031 * roadScale;
const deckHalfWidth = 0.036 * roadScale;
// Keep clearance around the supplied car model’s 0.00315 wheel span.
const pitHalfWidth = Math.max(0.0019, 0.006 * roadScale);

/** Sample the source curve directly so adjoining surfaces share the same height profile. */
const ribbon = (
  curve: CatmullRomCurve3,
  count: number,
  inner: number,
  outer: number,
  y: number,
  allowed: (point: TrackPoint3D) => boolean = () => true,
  colors?: Color[],
  range: [number, number] = [0, 1],
) => {
  const frames = Array.from({ length: count + 1 }, (_, index) => ({
    point: curve.getPointAt(range[0] + (range[1] - range[0]) * (index / count)),
    tangent: curve.getTangentAt(range[0] + (range[1] - range[0]) * (index / count)),
  }));
  const kerb = colors ? spaceKerbFrames3D(frames, (inner + outer) / 2, 0.0048 * roadScale) : null;
  const cornerSections = kerb ? cornerKerbSections3D(kerb.frames) : undefined;
  const paintedBlocks = new Set(kerb?.blockIndices.filter((_, index) => cornerSections?.[index]));
  const visibleSections = kerb?.blockIndices.map((block) => paintedBlocks.has(block));
  const data = buildTrackRibbon3D(
    kerb?.frames ?? frames,
    inner,
    outer,
    y,
    allowed,
    visibleSections,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(data.indices);
  if (colors) {
    const values = data.sections.flatMap((section) => {
      const color = colors[(kerb?.blockIndices[section] ?? section) % colors.length];
      return [color.r, color.g, color.b];
    });
    geometry.setAttribute("color", new Float32BufferAttribute(values, 3));
  }
  geometry.computeVertexNormals();
  return geometry;
};

/** WebGPU uniform bindings need backing storage even when a scenery batch has no instances. */
export const createReplayInstances3D = (
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  count: number,
) => {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = count;
  mesh.visible = count > 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export const createReplayWorld3D = (
  scene: Scene,
  center: Vector3,
  span: number,
  trackCurve: CatmullRomCurve3,
  pitCurve: CatmullRomCurve3 | null,
  bridge?: ReplayBridge3D,
  teamColors: string[] = [],
  surroundings?: CircuitSurroundings | null,
) => {
  const mapped = (x: number, z: number) =>
    !!surroundings && mapContainsPoint([x, z], surroundings.coverage);
  const mappedBuildings =
    surroundings?.buildings.flatMap((building) =>
      building.polygons.map((polygon) => mapBounds(polygon[0])),
    ) ?? [];
  const woodland =
    surroundings?.areas.filter((area) => area.kind === "wood").flatMap((area) => area.polygons) ??
    [];
  const overlapsMappedBuilding = (x: number, z: number, radius: number) =>
    mappedBuildings.some(
      (bounds) =>
        x + radius >= bounds.minX &&
        x - radius <= bounds.maxX &&
        z + radius >= bounds.minY &&
        z - radius <= bounds.maxY,
    );
  const mappedRoads =
    surroundings?.roads.map((road) => ({
      points: road.points.map(([x, z]) => ({ x, z })),
      bounds: mapBounds(road.points),
      halfWidth: ((road.widthM ?? 5) * surroundings.metersToWorld) / 2,
    })) ?? [];
  const overlapsMappedRoad = (x: number, z: number, radius: number) =>
    mappedRoads.some(
      (road) =>
        x + radius + road.halfWidth >= road.bounds.minX &&
        x - radius - road.halfWidth <= road.bounds.maxX &&
        z + radius + road.halfWidth >= road.bounds.minY &&
        z - radius - road.halfWidth <= road.bounds.maxY &&
        distanceToTrack3D({ x, z }, road.points, false) < radius + road.halfWidth,
    );
  const mappedTreeAllowed = (x: number, z: number, radius: number) =>
    !mapped(x, z) ||
    (woodland.some((polygon) =>
      [
        [x, z],
        [x + radius, z],
        [x - radius, z],
        [x, z + radius],
        [x, z - radius],
      ].every(([px, pz]) => mapContainsPoint([px, pz], polygon)),
    ) &&
      !overlapsMappedBuilding(x, z, radius) &&
      !overlapsMappedRoad(x, z, radius));
  let seed = 71;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const trackSamples = trackCurve.getSpacedPoints(800);
  const hasElevation = trackSamples.some((point) => Math.abs(point.y) > 1e-7);
  const pitSamples = pitCurve?.getSpacedPoints(100) ?? [];
  const bridgeRange: [number, number] | undefined = bridge
    ? [
        bridge.upperProgress - bridge.halfLength / trackCurve.getLength(),
        bridge.upperProgress + bridge.halfLength / trackCurve.getLength(),
      ]
    : undefined;
  const bridgeHeight = bridge ? trackCurve.getPointAt(bridge.upperProgress).y : 0;
  const bridgeLevel = (point: TrackPoint3D) => {
    if (
      !bridge ||
      point.y === undefined ||
      Math.hypot(point.x - bridge.center.x, point.z - bridge.center.z) >
        bridge.halfLength + deckHalfWidth
    )
      return 0;
    return Math.abs(point.y - bridgeHeight) < 0.008 ? 1 : -1;
  };
  const mainTrackDistance = (point: TrackPoint3D) => {
    const level = bridgeLevel(point);
    return distanceToTrack3D(
      point,
      trackSamples,
      true,
      level === 1 ? 0.008 : Infinity,
      level === -1 ? bridgeRange : undefined,
    );
  };
  const trackDistance = (point: TrackPoint3D) =>
    Math.min(mainTrackDistance(point), distanceToTrack3D(point, pitSamples, false));
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  if (!context) throw new Error("Canvas textures are unavailable.");
  const pixels = context.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 201 + random() * 22;
    pixels.data.set([value * 0.96, value, value * 0.9, 255], i);
  }
  context.putImageData(pixels, 0, 0);
  const grassTexture = new CanvasTexture(textureCanvas);
  grassTexture.colorSpace = SRGBColorSpace;
  grassTexture.wrapS = grassTexture.wrapT = RepeatWrapping;
  grassTexture.repeat.set(180, 180);
  grassTexture.anisotropy = 4;
  const groundMaterial = new MeshStandardMaterial({
    color: 0x7d9069,
    map: grassTexture,
    roughness: 1,
    vertexColors: true,
  });
  const roadHeight = 0.001;
  const gridSegments = surroundings ? 320 : 220;
  const gridSide = gridSegments + 1;
  const denseHalfCount = gridSegments / 2 - 10;
  const denseExtent = surroundings ? 2.3 : 1.5;
  const groundGeometry = new PlaneGeometry(span * 36, span * 36, gridSegments, gridSegments);
  groundGeometry.rotateX(-Math.PI / 2);
  const positions = groundGeometry.getAttribute("position");
  const grid = Array.from({ length: gridSide }, (_, index) => {
    if (!hasElevation && !surroundings) return (index / gridSegments - 0.5) * span * 36;
    if (index < 10) return -span * (denseExtent + (18 - denseExtent) * ((10 - index) / 10) ** 2);
    if (index > gridSegments - 10)
      return span * (denseExtent + (18 - denseExtent) * ((index - (gridSegments - 10)) / 10) ** 2);
    return ((index - gridSegments / 2) / denseHalfCount) * span * denseExtent;
  });
  const gridLocation = (value: number) => {
    let low = 0;
    let high = gridSegments;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (value < grid[middle]) high = middle;
      else low = middle;
    }
    return {
      index: low,
      fraction: MathUtils.clamp((value - grid[low]) / (grid[low + 1] - grid[low]), 0, 1),
    };
  };
  const terrainY = (worldX: number, worldZ: number) => {
    const x = gridLocation(worldX - center.x);
    const z = gridLocation(worldZ - center.z);
    const { index: ix, fraction: fx } = x;
    const { index: iz, fraction: fz } = z;
    const a = positions.getY(iz * gridSide + ix);
    const b = positions.getY((iz + 1) * gridSide + ix);
    const c = positions.getY((iz + 1) * gridSide + ix + 1);
    const d = positions.getY(iz * gridSide + ix + 1);
    return fx + fz <= 1
      ? a + (d - a) * fx + (b - a) * fz
      : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  };
  const terrainFrames = trackSamples.map((point, index) => ({
    point,
    tangent: trackCurve.getTangentAt(index / (trackSamples.length - 1)),
  }));
  const terrainOffsets = surroundings?.terrain
    ? trackSamples
        .map((point) => {
          const height = sampleMapTerrain(surroundings.terrain, [point.x, point.z]);
          return height === undefined
            ? NaN
            : height - point.y / (surroundings.metersToWorld * REPLAY_ELEVATION_SCALE_3D);
        })
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
    : [];
  const terrainDatum = terrainOffsets[Math.floor(terrainOffsets.length / 2)] ?? 0;
  const hasMappedTerrain = !!terrainOffsets.length;
  const colors: number[] = [];
  const fieldColor = new Color();
  for (let i = 0; i < positions.count; i++) {
    const x = grid[i % gridSide];
    const z = grid[Math.floor(i / gridSide)];
    let height = terrainHeight3D(x, z, span) - 0.001;
    const mappedHeight = hasMappedTerrain
      ? sampleMapTerrain(surroundings?.terrain, [x + center.x, z + center.z])
      : undefined;
    if (mappedHeight !== undefined && surroundings?.terrain) {
      const [minX, minZ, maxX, maxZ] = surroundings.terrain.bounds;
      const edge = Math.min(
        x + center.x - minX,
        maxX - x - center.x,
        z + center.z - minZ,
        maxZ - z - center.z,
      );
      height = MathUtils.lerp(
        height,
        (mappedHeight - terrainDatum) * surroundings.metersToWorld * REPLAY_ELEVATION_SCALE_3D,
        MathUtils.smoothstep(edge, 0, span * 0.03),
      );
    }
    if (mappedHeight === undefined && hasElevation && Math.abs(x) < span && Math.abs(z) < span) {
      const road = projectTrackPosition3D(
        { x: x + center.x, z: z + center.z },
        terrainFrames,
        undefined,
        undefined,
        bridgeRange,
      );
      if (road) {
        const blend = 1 - MathUtils.smoothstep(road.distance, span * 0.035, span * 0.17);
        height = MathUtils.lerp(height, (road.point.y ?? 0) - 0.001, blend);
      }
    }
    positions.setXYZ(i, x, height, z);
    const patch = Math.sin((x * 19) / span) * Math.cos((z * 15) / span) * 0.05;
    fieldColor.setHSL(0.225 + patch * 0.4, 0.12, 0.68 + patch);
    colors.push(fieldColor.r, fieldColor.g, fieldColor.b);
  }
  {
    const roadBands = [buildTrackRibbon3D(terrainFrames, -gravelOuter, gravelOuter, roadHeight)];
    if (pitCurve)
      roadBands.push(
        buildTrackRibbon3D(
          Array.from({ length: 801 }, (_, i) => ({
            point: pitCurve.getPointAt(i / 800),
            tangent: pitCurve.getTangentAt(i / 800),
          })),
          -pitHalfWidth,
          pitHalfWidth,
          roadHeight,
        ),
      );
    for (const band of roadBands) {
      for (let index = 0; index < band.indices.length; index += 3) {
        const road = band.indices.slice(index, index + 3).map((vertex) => ({
          x: band.positions[vertex * 3] - center.x,
          y: band.positions[vertex * 3 + 1],
          z: band.positions[vertex * 3 + 2] - center.z,
        }));
        const minX = gridLocation(Math.min(...road.map((p) => p.x))).index;
        const maxX = gridLocation(Math.max(...road.map((p) => p.x))).index;
        const minZ = gridLocation(Math.min(...road.map((p) => p.z))).index;
        const maxZ = gridLocation(Math.max(...road.map((p) => p.z))).index;
        for (let z = minZ; z <= maxZ; z++)
          for (let x = minX; x <= maxX; x++) {
            const a = z * gridSide + x;
            const b = a + gridSide;
            const c = b + 1;
            const d = a + 1;
            for (const triangle of [
              [a, b, d],
              [b, c, d],
            ]) {
              const groundPoints = triangle.map((vertex) => ({
                x: positions.getX(vertex),
                y: positions.getY(vertex),
                z: positions.getZ(vertex),
              }));
              const lowering = terrainRoadClearance3D(groundPoints, road);
              if (lowering > 0)
                for (const vertex of triangle)
                  positions.setY(vertex, positions.getY(vertex) - lowering);
            }
          }
      }
    }
  }
  groundGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  groundGeometry.computeVertexNormals();
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.position.set(center.x, 0, center.z);
  ground.receiveShadow = true;
  scene.add(ground);
  const mappedWorld = surroundings
    ? createMappedWorld3D(
        scene,
        surroundings,
        groundGeometry,
        center,
        terrainY,
        (point) => distanceToTrack3D(point, trackSamples),
        roadHalfWidth,
        grid,
        span,
      )
    : null;

  const asphalt = new MeshStandardMaterial({ color: 0x343b3b, roughness: 0.9, metalness: 0.06 });
  const white = new MeshStandardMaterial({ color: 0xefeee2, roughness: 0.85 });
  const red = new Color(0xb61c24);
  const concrete = new MeshStandardMaterial({ color: 0xa6aaa2, roughness: 0.94 });
  const metal = new MeshStandardMaterial({ color: 0xc7d0ce, roughness: 0.43, metalness: 0.65 });
  const glass = new MeshStandardMaterial({ color: 0x25414b, roughness: 0.23, metalness: 0.55 });
  const roof = new MeshStandardMaterial({ color: 0xcfd7d4, roughness: 0.55, metalness: 0.35 });
  const lamp = new MeshStandardMaterial({
    color: 0xffffe7,
    emissive: 0xffe4b0,
    emissiveIntensity: 0,
  });
  const marking = white.clone();
  marking.polygonOffset = true;
  marking.polygonOffsetFactor = -2;
  marking.polygonOffsetUnits = -2;
  marking.depthWrite = false;
  const addRibbon = (
    curve: CatmullRomCurve3,
    inner: number,
    outer: number,
    material: MeshStandardMaterial,
    allowed?: (point: TrackPoint3D) => boolean,
  ) => {
    const mesh = new Mesh(ribbon(curve, 800, inner, outer, roadHeight, allowed), material);
    mesh.receiveShadow = true;
    if (!material.depthWrite) mesh.renderOrder = 2;
    scene.add(mesh);
    return mesh;
  };
  const gravel = new MeshStandardMaterial({ color: 0xb6ab80, roughness: 1 });
  const runoff = new MeshStandardMaterial({ color: 0x508d66, roughness: 0.94 });
  // Disjoint bands replace stacked full-width planes, so runoff cannot shimmer through asphalt.
  const outsideRoad = (minimum: number) => (point: TrackPoint3D) =>
    mainTrackDistance(point) >= minimum - 0.00015 &&
    distanceToTrack3D(point, pitSamples, false) >= pitHalfWidth + 0.0003 * roadScale;
  for (const side of [-1, 1]) {
    addRibbon(trackCurve, side * runoffOuter, side * gravelOuter, gravel, outsideRoad(runoffOuter));
    addRibbon(
      trackCurve,
      side * roadHalfWidth,
      side * runoffOuter,
      runoff,
      outsideRoad(roadHalfWidth),
    );
  }
  addRibbon(trackCurve, -roadHalfWidth, roadHalfWidth, asphalt);
  for (const side of [-1, 1]) {
    addRibbon(
      trackCurve,
      side * (roadHalfWidth - 0.0007 * roadScale),
      side * (roadHalfWidth - 0.0002 * roadScale),
      marking,
      outsideRoad(roadHalfWidth - 0.0007 * roadScale),
    );
  }
  if (pitCurve) {
    // Asphalt shares the main road's plane. Painted pit edges stop before they enter that road.
    addRibbon(pitCurve, -pitHalfWidth, pitHalfWidth, asphalt);
    const outsideMainRoad = (point: TrackPoint3D) =>
      mainTrackDistance(point) > roadHalfWidth + 0.0007 * roadScale;
    addRibbon(
      pitCurve,
      -pitHalfWidth * 0.95,
      -pitHalfWidth * (0.0053 / 0.006),
      marking,
      outsideMainRoad,
    );
    addRibbon(
      pitCurve,
      pitHalfWidth * (0.0053 / 0.006),
      pitHalfWidth * 0.95,
      marking,
      outsideMainRoad,
    );
  }

  const dummy = new Object3D();
  const makeInstances = (
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    count: number,
  ) => {
    const mesh = createReplayInstances3D(geometry, material, count);
    scene.add(mesh);
    return mesh;
  };
  const put = (
    mesh: InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    angle = 0,
    color?: Color,
    pitch = 0,
  ) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(pitch, angle, 0, "YXZ");
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (color) mesh.setColorAt(index, color);
  };
  const boxGeometry = new BoxGeometry(1, 1, 1);
  const curbCount = Math.max(1600, Math.ceil(trackCurve.getLength() / 0.0024));
  const curbMaterial = marking.clone();
  curbMaterial.vertexColors = true;
  curbMaterial.polygonOffsetFactor = -3;
  curbMaterial.polygonOffsetUnits = -3;
  for (const side of [-1, 1]) {
    const kerbs = new Mesh(
      ribbon(
        trackCurve,
        curbCount,
        side * roadHalfWidth,
        side * kerbOuter,
        roadHeight,
        outsideRoad(roadHalfWidth),
        [red, white.color],
      ),
      curbMaterial,
    );
    kerbs.receiveShadow = true;
    kerbs.renderOrder = 3;
    scene.add(kerbs);
  }
  const barrierCount = 380;
  const barriers = makeInstances(boxGeometry, metal, barrierCount * 2);
  let barrierIndex = 0;
  for (let i = 0; i < barrierCount; i++) {
    const first = {
      point: trackCurve.getPointAt(i / barrierCount),
      tangent: trackCurve.getTangentAt(i / barrierCount),
    };
    const next = {
      point: trackCurve.getPointAt((i + 1) / barrierCount),
      tangent: trackCurve.getTangentAt((i + 1) / barrierCount),
    };
    const progress = (i + 0.5) / barrierCount;
    // Leave the underpass opening clear; ground beside the upper approach must not lift lower rails.
    if (
      bridge &&
      Math.abs(progress - bridge.lowerProgress) * trackCurve.getLength() < deckHalfWidth + 0.012
    )
      continue;
    for (const side of [-1, 1]) {
      const a = offsetTrackFrame3D(first, side * barrierOffset);
      const b = offsetTrackFrame3D(next, side * barrierOffset);
      const x = (a.x + b.x) / 2;
      const z = (a.z + b.z) / 2;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const angle = Math.atan2(b.x - a.x, b.z - a.z);
      if (
        length < 0.001 ||
        length > 0.04 ||
        !trackFootprintIsClear3D(
          { x, y: ((a.y ?? 0) + (b.y ?? 0)) / 2, z },
          angle,
          0.0012,
          length,
          0.029 * roadScale,
          trackDistance,
        )
      )
        continue;
      const onBridge = bridgeRange && progress >= bridgeRange[0] && progress <= bridgeRange[1];
      const base = onBridge ? ((a.y ?? 0) + (b.y ?? 0)) / 2 + roadHeight - 0.0002 : terrainY(x, z);
      const rise = (b.y ?? 0) - (a.y ?? 0);
      put(
        barriers,
        barrierIndex++,
        x,
        base + 0.003,
        z,
        0.0012,
        0.006,
        Math.hypot(length, rise) * 0.99,
        angle,
        undefined,
        -Math.atan2(rise, length),
      );
    }
  }
  barriers.count = barrierIndex;
  if (bridge && bridgeRange) {
    const deckFrame = (t: number) => {
      const progress = bridgeRange[0] + (bridgeRange[1] - bridgeRange[0]) * t;
      return { point: trackCurve.getPointAt(progress), tangent: trackCurve.getTangentAt(progress) };
    };
    const deckMaterial = concrete.clone();
    deckMaterial.side = DoubleSide;
    const deckBottom = roadHeight - 0.003;
    // Concrete shoulders are disjoint from the road bands. Only the underside casts the deck shadow.
    for (const side of [-1, 1]) {
      const shoulder = new Mesh(
        ribbon(
          trackCurve,
          80,
          side * gravelOuter,
          side * deckHalfWidth,
          roadHeight,
          undefined,
          undefined,
          bridgeRange,
        ),
        deckMaterial,
      );
      shoulder.receiveShadow = true;
      scene.add(shoulder);
    }
    const underside = new Mesh(
      ribbon(
        trackCurve,
        80,
        -deckHalfWidth,
        deckHalfWidth,
        deckBottom,
        undefined,
        undefined,
        bridgeRange,
      ),
      deckMaterial,
    );
    underside.castShadow = true;
    scene.add(underside);
    const sideVertices: number[] = [];
    const addSide = (a: TrackPoint3D, b: TrackPoint3D) => {
      for (const [point, level] of [
        [a, roadHeight],
        [b, roadHeight],
        [a, deckBottom],
        [a, deckBottom],
        [b, roadHeight],
        [b, deckBottom],
      ] as const) {
        sideVertices.push(point.x, (point.y ?? 0) + level, point.z);
      }
    };
    for (const side of [-1, 1]) {
      for (let index = 0; index < 40; index++) {
        const a = offsetTrackFrame3D(deckFrame(index / 40), side * deckHalfWidth);
        const b = offsetTrackFrame3D(deckFrame((index + 1) / 40), side * deckHalfWidth);
        addSide(a, b);
      }
    }
    for (const t of [0, 1]) {
      const frame = deckFrame(t);
      addSide(offsetTrackFrame3D(frame, -deckHalfWidth), offsetTrackFrame3D(frame, deckHalfWidth));
    }
    const sides = new BufferGeometry();
    sides.setAttribute("position", new Float32BufferAttribute(sideVertices, 3));
    const smoothSides = mergeVertices(sides, 1e-7);
    sides.dispose();
    smoothSides.computeVertexNormals();
    const fascia = new Mesh(smoothSides, deckMaterial);
    fascia.castShadow = true;
    scene.add(fascia);
    const lowerSamples = Array.from({ length: 61 }, (_, index) =>
      trackCurve.getPointAt(
        bridge.lowerProgress +
          ((index / 60 - 0.5) * bridge.halfLength * 4) / trackCurve.getLength(),
      ),
    );
    const supports = makeInstances(boxGeometry, concrete, 4);
    let supportIndex = 0;
    for (const t of [0.32, 0.68]) {
      for (const side of [-1, 1]) {
        const point = offsetTrackFrame3D(deckFrame(t), side * (deckHalfWidth - 0.003));
        if (distanceToTrack3D(point, lowerSamples, false) < roadHalfWidth + 0.004) continue;
        const base = terrainY(point.x, point.z);
        const height = (point.y ?? 0) + deckBottom - base;
        if (height <= 0.0004) continue;
        put(supports, supportIndex++, point.x, base + height / 2, point.z, 0.004, height, 0.004);
      }
    }
    supports.count = supportIndex;
  }
  {
    const wallVertices: number[] = [];
    const shoulderVertices: number[] = [];
    for (let i = 0; i < terrainFrames.length - 1; i++) {
      const progress = (i + 0.5) / (terrainFrames.length - 1);
      if (bridgeRange && progress >= bridgeRange[0] && progress <= bridgeRange[1]) continue;
      for (const side of [-1, 1]) {
        const a = offsetTrackFrame3D(terrainFrames[i], side * gravelOuter);
        const b = offsetTrackFrame3D(terrainFrames[i + 1], side * gravelOuter);
        if (
          [a, b, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }].some(
            (point) => trackDistance({ x: point.x, z: point.z }) < roadHalfWidth + 0.0002,
          )
        )
          continue;
        const topA = (a.y ?? 0) + roadHeight;
        const topB = (b.y ?? 0) + roadHeight;
        const bottomA = Math.min(topA, terrainY(a.x, a.z));
        const bottomB = Math.min(topB, terrainY(b.x, b.z));
        const outsideA = offsetTrackFrame3D(terrainFrames[i], side * (gravelOuter + span * 0.02));
        const outsideB = offsetTrackFrame3D(
          terrainFrames[i + 1],
          side * (gravelOuter + span * 0.02),
        );
        if (
          !retainingWallNeeded3D(
            [topA - bottomA, topB - bottomB],
            [topA - terrainY(outsideA.x, outsideA.z), topB - terrainY(outsideB.x, outsideB.z)],
            surroundings?.metersToWorld,
          )
        ) {
          // A small earth slope meets local ground; construction clearance is not a retaining wall.
          const outerA = offsetTrackFrame3D(terrainFrames[i], side * (gravelOuter + 0.0035));
          const outerB = offsetTrackFrame3D(terrainFrames[i + 1], side * (gravelOuter + 0.0035));
          const bank = [
            { ...a, y: topA - 0.00005 },
            { ...b, y: topB - 0.00005 },
            { ...outerA, y: Math.min(topA - 0.00005, terrainY(outerA.x, outerA.z)) },
            { ...outerB, y: Math.min(topB - 0.00005, terrainY(outerB.x, outerB.z)) },
          ];
          for (const indices of [
            [0, 1, 2],
            [2, 1, 3],
          ]) {
            const points = indices.map((index) => bank[index]);
            const checks = [
              ...points,
              ...points.map((p, index) => ({
                x: (p.x + points[(index + 1) % 3].x) / 2,
                z: (p.z + points[(index + 1) % 3].z) / 2,
              })),
            ];
            if (checks.some((point) => trackDistance(point) < roadHalfWidth + 0.0002)) continue;
            for (const point of points) shoulderVertices.push(point.x, point.y, point.z);
          }
          continue;
        }
        for (const [point, height] of [
          [a, topA],
          [b, topB],
          [a, bottomA],
          [a, bottomA],
          [b, topB],
          [b, bottomB],
        ] as const)
          wallVertices.push(point.x, height, point.z);
      }
    }
    const wallGeometry = new BufferGeometry();
    wallGeometry.setAttribute("position", new Float32BufferAttribute(wallVertices, 3));
    wallGeometry.computeVertexNormals();
    const wallMaterial = concrete.clone();
    wallMaterial.side = DoubleSide;
    const walls = new Mesh(wallGeometry, wallMaterial);
    walls.castShadow = true;
    scene.add(walls);
    const shoulderGeometry = new BufferGeometry();
    shoulderGeometry.setAttribute("position", new Float32BufferAttribute(shoulderVertices, 3));
    shoulderGeometry.computeVertexNormals();
    const shoulders = new Mesh(
      shoulderGeometry,
      new MeshStandardMaterial({ color: 0x68795b, roughness: 1, side: DoubleSide }),
    );
    shoulders.receiveShadow = true;
    scene.add(shoulders);
  }
  const start = trackCurve.getPointAt(0);
  const startDirection = trackCurve.getPointAt(0.002).sub(start).normalize();
  const checkerCanvas = document.createElement("canvas");
  checkerCanvas.width = 80;
  checkerCanvas.height = 16;
  const checkerContext = checkerCanvas.getContext("2d");
  if (!checkerContext) throw new Error("Canvas textures are unavailable.");
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 10; column++) {
      checkerContext.fillStyle = (row + column) % 2 ? "#eeeeee" : "#202526";
      checkerContext.fillRect(column * 8, row * 8, 8, 8);
    }
  }
  const checkerTexture = new CanvasTexture(checkerCanvas);
  checkerTexture.colorSpace = SRGBColorSpace;
  checkerTexture.magFilter = NearestFilter;
  checkerTexture.anisotropy = 4;
  const checkerMaterial = marking.clone();
  checkerMaterial.map = checkerTexture;
  checkerMaterial.polygonOffsetFactor = -4;
  checkerMaterial.polygonOffsetUnits = -4;
  const checker = new Mesh(
    new PlaneGeometry(roadHalfWidth * 2, 0.0026 * roadScale),
    checkerMaterial,
  );
  checker.geometry.rotateX(-Math.PI / 2);
  checker.position.set(start.x, start.y + roadHeight, start.z);
  checker.rotation.set(
    -Math.atan2(startDirection.y, Math.hypot(startDirection.x, startDirection.z)),
    Math.atan2(startDirection.x, startDirection.z),
    0,
    "YXZ",
  );
  checker.receiveShadow = true;
  checker.renderOrder = 4;
  scene.add(checker);

  // Shared geometry keeps the forest and facilities inexpensive enough for replay scrubbing.
  const treeCount = 2300;
  const trunks = makeInstances(
    new CylinderGeometry(0.12, 0.2, 1, 5),
    new MeshStandardMaterial({ color: 0x66533a, roughness: 1 }),
    treeCount,
  );
  const leaves = makeInstances(
    new SphereGeometry(1, 7, 6),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    treeCount * 3,
  );
  const treeColor = new Color();
  const facilities: Array<{ x: number; z: number; angle: number }> = [];
  for (let i = 0; i < 26; i++) {
    const t = (i * 0.071 + 0.05) % 1;
    const point = trackCurve.getPointAt(t);
    const tangent = trackCurve.getTangentAt(t);
    const side = i % 2 ? -1 : 1;
    const x = point.x + tangent.z * side * 0.067;
    const z = point.z - tangent.x * side * 0.067;
    const angle = Math.atan2(tangent.x, tangent.z) + (side < 0 ? Math.PI : 0);
    if (
      mapped(x, z) ||
      trackDistance({ x, z }) < 0.046 ||
      facilities.some((f) => Math.hypot(f.x - x, f.z - z) < 0.09)
    )
      continue;
    if (!trackFootprintIsClear3D({ x, z }, angle, 0.058, 0.098, 0.02, trackDistance)) continue;
    facilities.push({ x, z, angle });
  }
  const pitBoxRow = pitCurve
    ? selectPitBoxRow3D(
        Array.from({ length: 501 }, (_, i) => ({
          point: pitCurve.getPointAt(i / 500),
          tangent: pitCurve.getTangentAt(i / 500),
        })),
        (frame, side, spacing) => {
          const width = PIT_BOX_3D.apronDepth + PIT_BOX_3D.garageDepth;
          const point = offsetTrackFrame3D(frame, side * (pitHalfWidth + width / 2));
          const angle = Math.atan2(frame.tangent.x, frame.tangent.z);
          const mainClear = trackFootprintIsClear3D(
            { x: point.x, z: point.z },
            angle,
            width,
            spacing,
            roadHalfWidth + 0.0005,
            (p) => distanceToTrack3D(p, trackSamples),
          );
          const garage = offsetTrackFrame3D(
            frame,
            side * (pitHalfWidth + PIT_BOX_3D.apronDepth + PIT_BOX_3D.garageDepth / 2),
          );
          return (
            !overlapsMappedBuilding(
              garage.x,
              garage.z,
              Math.hypot(PIT_BOX_3D.garageDepth, spacing) / 2,
            ) &&
            mainClear &&
            trackFootprintIsClear3D(
              { x: garage.x, z: garage.z },
              angle,
              PIT_BOX_3D.garageDepth,
              spacing,
              pitHalfWidth + 0.0004,
              (p) => distanceToTrack3D(p, pitSamples, false),
            )
          );
        },
        teamColors.length || 10,
      )
    : [];
  const woodlandRegions = woodland.map((polygon) => ({ polygon, bounds: mapBounds(polygon[0]) }));
  const woodlandWeights = woodlandRegions.map(
    (region) =>
      (region.bounds.maxX - region.bounds.minX) * (region.bounds.maxY - region.bounds.minY),
  );
  const woodlandArea = woodlandWeights.reduce((a, b) => a + b, 0);
  let treeIndex = 0;
  let mappedTreeCount = 0;
  for (let attempt = 0; treeIndex < treeCount && attempt < treeCount * 6; attempt++) {
    const mapTree = !!surroundings && woodlandArea > 0 && mappedTreeCount < 1400;
    const near = mapTree || treeIndex < 1100;
    let x = center.x + (random() - 0.5) * span * (near ? 3.8 : 15),
      z = center.z + (random() - 0.5) * span * (near ? 3.8 : 15);
    if (mapTree) {
      let pick = random() * woodlandArea,
        index = 0;
      while (index < woodlandWeights.length - 1 && pick > woodlandWeights[index])
        pick -= woodlandWeights[index++];
      const { bounds } = woodlandRegions[index];
      x = bounds.minX + random() * (bounds.maxX - bounds.minX);
      z = bounds.minY + random() * (bounds.maxY - bounds.minY);
    }
    const radius =
      mapTree && surroundings
        ? (3 + random() * 4) * surroundings.metersToWorld
        : (0.009 + random() * 0.015) * (near ? 1 : 2.8);
    if (!mappedTreeAllowed(x, z, radius)) continue;
    if (
      near &&
      (trackDistance({ x, z }) < (mapTree ? roadHalfWidth + 0.001 : 0.041) + radius ||
        facilities.some((f) => Math.hypot(f.x - x, f.z - z) < 0.085) ||
        pitBoxRow.some((bay) => Math.hypot(bay.point.x - x, bay.point.z - z) < 0.03 + radius))
    )
      continue;
    // Leave open lawns inside the course and break up the forest with meadows.
    if (!mapTree && Math.hypot(x - center.x, z - center.z) < span * 0.65 && random() < 0.86)
      continue;
    const y = terrainY(x, z);
    const height =
      mapTree && surroundings
        ? (8 + random() * 10) * surroundings.metersToWorld
        : radius * (2.7 + random());
    if (mapTree) mappedTreeCount++;
    put(trunks, treeIndex, x, y + height * 0.35, z, radius * 0.9, height * 0.7, radius * 0.9);
    for (let lobe = 0; lobe < 3; lobe++) {
      treeColor.setHSL(0.24 + random() * 0.095, 0.4 + random() * 0.15, 0.13 + random() * 0.12);
      put(
        leaves,
        treeIndex * 3 + lobe,
        x + (lobe - 1) * radius * 0.47,
        y + height * (0.66 + (lobe % 2) * 0.14),
        z + (lobe % 2) * radius * 0.35,
        radius,
        height * 0.35,
        radius * 0.85,
        random() * Math.PI,
        treeColor,
      );
    }
    treeIndex++;
  }
  trunks.count = treeIndex;
  leaves.count = treeIndex * 3;

  const standFoundations = makeInstances(boxGeometry, concrete, facilities.length);
  const buildings = makeInstances(boxGeometry, concrete, facilities.length);
  const roofs = makeInstances(boxGeometry, roof, facilities.length);
  const windows = makeInstances(boxGeometry, glass, facilities.length);
  const seats = makeInstances(boxGeometry, white, facilities.length * 6);
  const canopySupports = makeInstances(boxGeometry, metal, facilities.length * 4);
  let seatIndex = 0;
  facilities.forEach((facility, index) => {
    const { x, z, angle } = facility;
    const height = 0.015;
    const width = 0.043;
    const length = 0.09;
    const groundCorners = [-1, 1].flatMap((sideX) =>
      [-1, 1].map((sideZ) =>
        terrainY(
          x +
            Math.cos(angle) * sideX * width * 0.7 +
            (Math.sin(angle) * sideZ * (length + 0.008)) / 2,
          z -
            Math.sin(angle) * sideX * width * 0.7 +
            (Math.cos(angle) * sideZ * (length + 0.008)) / 2,
        ),
      ),
    );
    const y = Math.max(...groundCorners) + 0.0002;
    const base = Math.min(...groundCorners) - 0.0002;
    put(standFoundations, index, x, (base + y) / 2, z, width, y - base, length, angle);
    put(buildings, index, x, y + height / 2, z, width, height, length, angle);
    for (let support = 0; support < 4; support++) {
      const localX = (support % 2 ? 0.55 : -0.05) * width;
      const localZ = (support < 2 ? -0.45 : 0.45) * length;
      put(
        canopySupports,
        index * 4 + support,
        x + Math.cos(angle) * localX + Math.sin(angle) * localZ,
        y + height + 0.006375,
        z - Math.sin(angle) * localX + Math.cos(angle) * localZ,
        0.0012,
        0.01275,
        0.0012,
        angle,
      );
    }
    put(
      roofs,
      index,
      x + Math.cos(angle) * width * 0.25,
      y + height + 0.014,
      z - Math.sin(angle) * width * 0.25,
      width * 0.7,
      0.0025,
      length + 0.008,
      angle,
    );
    put(
      windows,
      index,
      x + Math.cos(angle) * width * 0.48,
      y + height + 0.0035,
      z - Math.sin(angle) * width * 0.48,
      0.002,
      0.007,
      length * 0.94,
      angle,
    );
    for (let row = 0; row < 6; row++) {
      const offset = ((row - 2.5) * width) / 6;
      put(
        seats,
        seatIndex++,
        x + Math.cos(angle) * offset,
        y + height + 0.001 + row * 0.0005,
        z - Math.sin(angle) * offset,
        width / 8,
        0.002,
        length * 0.94,
        angle,
        new Color(row % 3 === 0 ? 0xe1d9d0 : row % 3 === 1 ? 0xb92d36 : 0x3c617c),
      );
    }
  });
  seats.count = seatIndex;

  if (pitBoxRow.length) {
    const count = pitBoxRow.length;
    const foundations = makeInstances(boxGeometry, concrete, count);
    const garageWalls = makeInstances(boxGeometry, concrete, count * 3);
    const garageRoofs = makeInstances(boxGeometry, roof, count);
    const garageSigns = makeInstances(boxGeometry, white, count);
    const apronPositions: number[] = [];
    const paintPositions: number[] = [];
    const paintColors: number[] = [];
    pitBoxRow.forEach((frame, index) => {
      const { apronDepth, garageDepth, height } = PIT_BOX_3D;
      const { spacing } = frame;
      const angle = Math.atan2(frame.tangent.x, frame.tangent.z);
      const centerOffset = pitHalfWidth + apronDepth + garageDepth / 2;
      const center = offsetTrackFrame3D(frame, frame.side * centerOffset);
      const planar = Math.hypot(frame.tangent.x, frame.tangent.z) || 1;
      const position = (offset: number, along: number) => {
        const point = offsetTrackFrame3D(frame, frame.side * offset);
        return {
          x: point.x + (frame.tangent.x / planar) * along,
          z: point.z + (frame.tangent.z / planar) * along,
        };
      };
      const groundCorners = [-1, 1].flatMap((x) =>
        [-1, 1].map((z) => {
          const p = position(centerOffset + (x * garageDepth) / 2, (z * spacing) / 2);
          return terrainY(p.x, p.z);
        }),
      );
      const floor = Math.max(
        (frame.point.y ?? 0) + roadHeight,
        ...groundCorners.map((y) => y + 0.0002),
      );
      const base = Math.min(...groundCorners) - 0.0002;
      put(
        foundations,
        index,
        center.x,
        (base + floor) / 2,
        center.z,
        garageDepth,
        floor - base,
        spacing,
        angle,
      );
      const rear = position(pitHalfWidth + apronDepth + garageDepth - 0.0003, 0);
      put(
        garageWalls,
        index * 3,
        rear.x,
        floor + height / 2,
        rear.z,
        0.0006,
        height,
        spacing,
        angle,
      );
      for (const side of [-1, 1]) {
        const p = position(centerOffset, side * (spacing / 2 - 0.00025));
        put(
          garageWalls,
          index * 3 + (side === -1 ? 1 : 2),
          p.x,
          floor + height / 2,
          p.z,
          garageDepth,
          height,
          0.0005,
          angle,
        );
      }
      put(
        garageRoofs,
        index,
        center.x,
        floor + height + 0.0003,
        center.z,
        garageDepth + 0.0004,
        0.0006,
        spacing + 0.0002,
        angle,
      );
      const front = position(pitHalfWidth + apronDepth + 0.00015, 0);
      const color = new Color(teamColors[index % Math.max(teamColors.length, 1)] ?? "#70808d");
      put(
        garageSigns,
        index,
        front.x,
        floor + height - 0.00065,
        front.z,
        0.00035,
        0.0013,
        spacing - 0.0006,
        angle,
        color,
      );
      const addQuad = (
        output: number[],
        near: number,
        far: number,
        start: number,
        end: number,
        paint = false,
      ) => {
        for (const [offset, along] of [
          [near, start],
          [far, start],
          [near, end],
          [near, end],
          [far, start],
          [far, end],
        ]) {
          const p = position(offset, along);
          const blend = MathUtils.clamp((offset - pitHalfWidth) / apronDepth, 0, 1);
          const laneHeight =
            (frame.point.y ?? 0) + roadHeight + ((frame.tangent.y ?? 0) / planar) * along;
          output.push(p.x, MathUtils.lerp(laneHeight, floor, blend) + (paint ? 0.00002 : 0), p.z);
          if (paint) paintColors.push(color.r, color.g, color.b);
        }
      };
      addQuad(
        apronPositions,
        pitHalfWidth,
        pitHalfWidth + apronDepth + 0.0001,
        -spacing / 2,
        spacing / 2,
      );
      const near = pitHalfWidth + 0.0006;
      const far = pitHalfWidth + apronDepth - 0.0005;
      for (const along of [-0.003, 0.003])
        addQuad(paintPositions, near, far, along - 0.0001, along + 0.0001, true);
      for (const offset of [near, far])
        addQuad(paintPositions, offset - 0.0001, offset + 0.0001, -0.003, 0.003, true);
      addQuad(paintPositions, near + 0.0004, far - 0.0004, 0.0018, 0.00205, true);
    });
    const apronMaterial = concrete.clone();
    apronMaterial.side = DoubleSide;
    const apronGeometry = new BufferGeometry();
    apronGeometry.setAttribute("position", new Float32BufferAttribute(apronPositions, 3));
    apronGeometry.computeVertexNormals();
    const apron = new Mesh(apronGeometry, apronMaterial);
    apron.receiveShadow = true;
    scene.add(apron);
    const paintGeometry = new BufferGeometry();
    paintGeometry.setAttribute("position", new Float32BufferAttribute(paintPositions, 3));
    paintGeometry.setAttribute("color", new Float32BufferAttribute(paintColors, 3));
    paintGeometry.computeVertexNormals();
    const pitPaint = marking.clone();
    pitPaint.vertexColors = true;
    pitPaint.side = DoubleSide;
    const paint = new Mesh(paintGeometry, pitPaint);
    paint.renderOrder = 3;
    scene.add(paint);
  }
  const poleCount = 56;
  const poles = makeInstances(new CylinderGeometry(0.00065, 0.001, 0.057, 5), metal, poleCount);
  const lamps = makeInstances(boxGeometry, lamp, poleCount);
  const poolCanvas = document.createElement("canvas");
  poolCanvas.width = poolCanvas.height = 64;
  const poolContext = poolCanvas.getContext("2d");
  if (!poolContext) throw new Error("Canvas textures are unavailable.");
  const gradient = poolContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  poolContext.fillStyle = gradient;
  poolContext.fillRect(0, 0, 64, 64);
  const poolTexture = new CanvasTexture(poolCanvas);
  const lightPools = new InstancedMesh(
    new PlaneGeometry(0.07, 0.07),
    new MeshBasicMaterial({
      color: 0xffe8b0,
      map: poolTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
    poleCount,
  );
  lightPools.geometry.rotateX(-Math.PI / 2);
  scene.add(lightPools);
  let poleIndex = 0;
  const placedPoles: TrackPoint3D[] = [];
  for (let i = 0; i < poleCount; i++) {
    const point = trackCurve.getPointAt(i / poleCount);
    const tangent = trackCurve.getTangentAt(i / poleCount);
    const x = point.x + tangent.z * (barrierOffset + 0.007);
    const z = point.z - tangent.x * (barrierOffset + 0.007);
    if (
      overlapsMappedBuilding(x, z, 0.002) ||
      overlapsMappedRoad(x, z, 0.0015) ||
      trackDistance({ x, z }) < gravelOuter + 0.005 ||
      placedPoles.some((pole) => Math.hypot(pole.x - x, pole.z - z) < 0.065) ||
      (bridge && Math.hypot(x - bridge.center.x, z - bridge.center.z) < bridge.halfLength + 0.025)
    )
      continue;
    placedPoles.push({ x, z });
    put(poles, poleIndex, x, terrainY(x, z) + 0.0285, z, 1, 1, 1);
    put(
      lamps,
      poleIndex,
      x,
      terrainY(x, z) + 0.057,
      z,
      0.009,
      0.002,
      0.004,
      Math.atan2(tangent.x, tangent.z),
    );
    put(lightPools, poleIndex, point.x, point.y + 0.0018, point.z, 1, 1, 1);
    poleIndex++;
  }
  poles.count = lamps.count = lightPools.count = poleIndex;

  const hemisphere = new HemisphereLight(0xc4deed, 0x607044, 1.6);
  scene.add(hemisphere);
  const sun = new DirectionalLight(0xffefce, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -span * 1.25;
  sun.shadow.camera.right = sun.shadow.camera.top = span * 1.25;
  sun.shadow.camera.near = 0.05;
  sun.shadow.camera.far = span * 10;
  sun.shadow.bias = -0.00002;
  sun.shadow.normalBias = 0.0001;
  sun.target.position.copy(center);
  scene.add(sun, sun.target);

  const skyUniforms = {
    topColor: uniform(new Color(0x428dbd)),
    horizonColor: uniform(new Color(0xc4d4d1)),
    sunColor: uniform(new Color(0xffe3aa)),
    sunDirection: uniform(new Vector3(0, 1, 0)),
    cloudCover: uniform(0),
    cloudTime: uniform(new Vector3()),
    daylight: uniform(1),
  };
  const noise = Fn(([point]: [Node<"vec2">]) => {
    const hash = (p: Node<"vec2">) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
    const grid = floor(point);
    const fraction = fract(point);
    const blend = fraction.mul(fraction).mul(float(3).sub(fraction.mul(2)));
    return mix(
      mix(hash(grid), hash(grid.add(vec2(1, 0))), blend.x),
      mix(hash(grid.add(vec2(0, 1))), hash(grid.add(vec2(1, 1))), blend.x),
      blend.y,
    );
  });
  const skyMaterial = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
  skyMaterial.colorNode = Fn(() => {
    const direction = normalize(positionLocal);
    const altitude = max(direction.y, 0);
    const color = mix(skyUniforms.horizonColor, skyUniforms.topColor, pow(altitude, 0.6)).toVar();
    const sunDot = max(dot(direction, normalize(skyUniforms.sunDirection)), 0);
    color.addAssign(
      skyUniforms.sunColor
        .mul(pow(sunDot, 900).mul(1.7).add(pow(sunDot, 14).mul(0.17)))
        .mul(skyUniforms.daylight)
        .mul(float(1).sub(skyUniforms.cloudCover.mul(0.85))),
    );
    const uv = direction.xz.div(altitude.add(0.2)).mul(2).add(skyUniforms.cloudTime.xz);
    const n = noise(uv)
      .mul(0.54)
      .add(noise(uv.mul(2.1)).mul(0.28))
      .add(noise(uv.mul(4.3)).mul(0.12))
      .add(noise(uv.mul(8.7)).mul(0.06));
    const clouds = smoothstep(
      float(0.69).sub(skyUniforms.cloudCover.mul(0.34)),
      float(0.84).sub(skyUniforms.cloudCover.mul(0.24)),
      n,
    ).mul(smoothstep(0.02, 0.22, direction.y));
    const cloudColor = mix(
      vec3(0.09, 0.12, 0.17),
      vec3(float(0.87).sub(skyUniforms.cloudCover.mul(0.23))),
      skyUniforms.daylight,
    );
    return vec4(mix(color, cloudColor, clouds.mul(0.92)), 1);
  })();
  const sky = new Mesh(new SphereGeometry(span * 55, 24, 16), skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);
  const fog = new Fog(0xc4d4d1, span * 5, span * 14);
  scene.fog = fog;
  const fogColor = uniform(fog.color),
    fogNear = uniform(fog.near),
    fogFar = uniform(fog.far);
  if (surroundings) {
    const ring = surroundings.coverage[0];
    const area = ring.reduce((total, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return total + p[0] * q[1] - q[0] * p[1];
    }, 0);
    const boundaryFog = Fn(() => {
      const edgeDistance = float(1e6).toVar();
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          length = Math.hypot(dx, dz);
        if (length < 1e-8) continue;
        const inward = positionWorld.z
          .sub(a[1])
          .mul(dx)
          .sub(positionWorld.x.sub(a[0]).mul(dz))
          .mul((area > 0 ? 1 : -1) / length);
        edgeDistance.assign(min(edgeDistance, inward));
      }
      return smoothstep(span * 0.03, span * 0.45, edgeDistance).oneMinus();
    })();
    scene.fogNode = fogNode(fogColor, max(boundaryFog, rangeFogFactor(fogNear, fogFar)));
  }

  const rainCount = 1200;
  const rainPositions = new Float32Array(rainCount * 6);
  const rainSeeds = Array.from({ length: rainCount }, () => [random(), random(), random()]);
  const rainGeometry = new BufferGeometry();
  rainGeometry.setAttribute("position", new Float32BufferAttribute(rainPositions, 3));
  const rainMaterial = new LineBasicMaterial({
    color: 0xc5deed,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const rain = new LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  scene.add(rain);
  let previousEnvironmentKey = "";
  const update = (
    environment: ReplayEnvironment,
    camera: PerspectiveCamera,
    renderer: WebGPURenderer,
  ) => {
    sky.position.copy(camera.position);
    // Fog begins beyond the entire circuit even when overview zooms out.
    const cameraDistance = camera.position.distanceTo(center);
    fog.near = cameraDistance + span * (environment.rainfall ? 1 : 2);
    fog.far = cameraDistance + span * (environment.rainfall ? 6 : 12);
    fogNear.value = fog.near;
    fogFar.value = fog.far;
    const environmentKey = `${environment.localHour.toFixed(3)}:${environment.rainfall}:${environment.cloudCover}`;
    if (environmentKey !== previousEnvironmentKey) {
      previousEnvironmentKey = environmentKey;
      const angle = ((environment.localHour - 6) / 24) * Math.PI * 2;
      const elevation = Math.sin(angle);
      const daylight = MathUtils.smoothstep(elevation, -0.12, 0.22);
      const sunset = (1 - MathUtils.smoothstep(Math.abs(elevation), 0.02, 0.42)) * daylight;
      const rainLevel = environment.rainfall;
      const horizon = new Color(0x0c182c)
        .lerp(new Color(0xc8d7d5), daylight)
        .lerp(new Color(0xdfa979), sunset * 0.5);
      horizon.lerp(new Color(0x7d939c), rainLevel * daylight * 0.65);
      const top = new Color(0x03091b)
        .lerp(new Color(0x478ebc), daylight)
        .lerp(new Color(0x6b8595), rainLevel * 0.75);
      skyUniforms.topColor.value.copy(top);
      skyUniforms.horizonColor.value.copy(horizon);
      skyUniforms.daylight.value = daylight;
      skyUniforms.cloudCover.value = environment.cloudCover;
      const sunDirection = new Vector3(
        Math.cos(angle),
        Math.max(elevation, 0.13),
        0.38,
      ).normalize();
      skyUniforms.sunDirection.value.copy(sunDirection);
      skyUniforms.sunColor.value.set(sunset > 0.2 ? 0xffbb72 : 0xffefd3);
      fog.color.copy(horizon);
      scene.background = horizon;
      sun.position.copy(center).addScaledVector(sunDirection, span * 4);
      sun.color.set(daylight < 0.2 ? 0xbccfea : sunset > 0.2 ? 0xffc786 : 0xfff0d7);
      sun.intensity = (0.55 + daylight * 2.6) * (1 - rainLevel * 0.72);
      hemisphere.intensity = 1 + daylight * 0.95;
      hemisphere.color.set(daylight > 0.5 ? 0xc7deee : 0x7496ce);
      renderer.toneMappingExposure = 0.92 + daylight * 0.15;
      asphalt.color.set(rainLevel > 0 ? 0x242f32 : 0x343b3b);
      // Race circuits remain floodlit at recorded night times, including mapped urban venues.
      asphalt.emissive.set(0x7c8891);
      asphalt.emissiveIntensity = (1 - daylight) * 0.15 * (1 - rainLevel * 0.2);
      asphalt.roughness = 0.88 - rainLevel * 0.66;
      asphalt.metalness = 0.06 + rainLevel * 0.26;
      lamp.emissiveIntensity = (1 - daylight) * 6 + rainLevel * 0.3;
      (lightPools.material as MeshBasicMaterial).opacity = (1 - daylight) * 0.12;
      rain.visible = rainLevel > 0;
      rainMaterial.opacity = rainLevel * 0.45;
      rainGeometry.setDrawRange(0, Math.ceil(rainCount * rainLevel) * 2);
    }
    const time = (environment.timeMs / 1000) % 1_000_000;
    const windAngle = MathUtils.degToRad(environment.windDirection);
    const drift = Math.min(environment.windSpeed, 30) * 0.0008;
    skyUniforms.cloudTime.value.set(
      Math.cos(windAngle) * time * drift * 0.07,
      0,
      Math.sin(windAngle) * time * drift * 0.07,
    );
    if (rain.visible) {
      const array = rainGeometry.getAttribute("position");
      const fieldSize = Math.max(0.25, Math.min(span * 3, cameraDistance * 1.5));
      for (let i = 0; i < rainCount; i++) {
        const [a, b, c] = rainSeeds[i];
        const x =
          camera.position.x +
          (((((a + time * drift * Math.cos(windAngle)) % 1) + 1) % 1) - 0.5) * fieldSize;
        const z =
          camera.position.z +
          (((((c + time * drift * Math.sin(windAngle)) % 1) + 1) % 1) - 0.5) * fieldSize;
        const y = ((((b - time * 0.9) % 1) + 1) % 1) * fieldSize;
        array.setXYZ(i * 2, x, y, z);
        array.setXYZ(i * 2 + 1, x - drift * 0.06, y + fieldSize * 0.022, z);
      }
      array.needsUpdate = true;
    }
  };
  let terrainMinimum = Infinity;
  for (let i = 0; i < positions.count; i++)
    terrainMinimum = Math.min(terrainMinimum, positions.getY(i));
  return {
    pitBoxCount: pitBoxRow.length,
    mappedBuildingCount: mappedWorld?.buildingCount ?? 0,
    mappedTreeCount,
    hasMappedTerrain,
    terrainMinimum,
    mapFeatureCount: surroundings
      ? surroundings.buildings.length + surroundings.roads.length + surroundings.areas.length
      : 0,
    update,
    dispose: () => {
      grassTexture.dispose();
      poolTexture.dispose();
      checkerTexture.dispose();
      sun.shadow.dispose();
    },
  };
};
