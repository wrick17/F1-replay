import { describe, expect, test } from "bun:test";
import { buildTrackRibbon3D, cornerKerbSections3D, cleanTrackPoints3D, distanceToTrack3D, getTrackBounds3D, offsetTrackFrame3D, projectTrackPosition3D, spaceKerbFrames3D, selectPitBoxRow3D, smoothTrackAngle3D, terrainHeight3D, terrainRoadClearance3D, retainingWallNeeded3D, trackFootprintIsClear3D, toTrackPoints3D } from "../../src/modules/replay/utils/track3d.util";

describe("3D track geometry", () => {
  test("lowers coarse terrain beneath the entire intersecting road triangle", () => {
    const ground = [{ x: 0, z: 0, y: 0.1 }, { x: 1, z: 0, y: 0.02 }, { x: 0, z: 1, y: 0.04 }];
    const road = [{ x: 0.15, z: 0.3, y: 0.025 }, { x: 0.7, z: 0.3, y: 0.035 }, { x: 0.4, z: 0.34, y: 0.03 }];
    const lowering = terrainRoadClearance3D(ground, road);
    expect(lowering).toBeGreaterThan(0);
    for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20 - a; b++) {
      const weights = [a / 20, b / 20, 1 - (a + b) / 20];
      const x = road.reduce((sum, point, i) => sum + point.x * weights[i], 0);
      const z = road.reduce((sum, point, i) => sum + point.z * weights[i], 0);
      const roadY = road.reduce((sum, point, i) => sum + point.y * weights[i], 0);
      if (x + z <= 1) expect(0.1 * (1 - x - z) + 0.02 * x + 0.04 * z - lowering).toBeLessThan(roadY - 0.000299);
    }
    const lowered = ground.map((point) => ({ ...point, y: point.y - lowering }));
    expect(terrainRoadClearance3D(lowered, road)).toBe(0);
    expect(terrainRoadClearance3D(ground, road.map((point) => ({ ...point, x: point.x + 2 })))).toBe(0);
    expect(terrainRoadClearance3D(lowered, road.map((point) => ({ ...point, y: point.y + 0.018 })))).toBe(0);
  });

  test("paints sustained corners while leaving noisy straights without kerbs", () => {
    const straight = Array.from({ length: 301 }, (_, i) => ({ point: { x: i / 300, z: Math.sin(i * 2) * 0.00001 }, tangent: { x: 1, z: 0 } }));
    expect(cornerKerbSections3D(straight).some(Boolean)).toBe(false);
    const circle = Array.from({ length: 301 }, (_, i) => {
      const angle = i / 300 * Math.PI * 2;
      return { point: { x: Math.cos(angle) * 0.08, z: Math.sin(angle) * 0.08 }, tangent: { x: -Math.sin(angle), z: Math.cos(angle) } };
    });
    expect(cornerKerbSections3D(circle).every(Boolean)).toBe(true);
    expect(buildTrackRibbon3D(straight, 0.0045, 0.0053, 0.001, undefined, cornerKerbSections3D(straight)).indices).toHaveLength(0);
  });

  test("removes the British lap seam overshoot without moving start/finish", () => {
    const points = [
      { x: -1756, z: 1208 }, { x: 1000, z: 2000 }, { x: 1000, z: -1000 },
      { x: -1759, z: 1205 }, { x: -1707, z: 1275 },
    ];
    const cleaned = cleanTrackPoints3D(points, true);
    expect(cleaned).toEqual(points.slice(0, -1));
    expect(points).toHaveLength(5);
    const square = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }];
    expect(cleanTrackPoints3D(square, true)).toEqual(square);
  });

  test("removes isolated pit source reversals but preserves a sustained hairpin", () => {
    const entry = [{ x: 119, z: -1778 }, { x: 401, z: -1939 }, { x: 287, z: -1770 }, { x: 211, z: -1656 }];
    expect(cleanTrackPoints3D(entry, false)).toEqual([entry[0], entry[2], entry[3]]);
    const spike = [{ x: -90, z: 3075 }, { x: -55, z: 3126 }, { x: -33, z: 3159 }, { x: -50, z: 3134 }, { x: -18, z: 3182 }];
    expect(cleanTrackPoints3D(spike, false)).toEqual([spike[0], spike[1], spike[3], spike[4]]);
    const hairpin = [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0.005, z: 1.05 }, { x: 0.01, z: 1 }, { x: 0.01, z: 0 }];
    expect(cleanTrackPoints3D(hairpin, false)).toEqual(hairpin);
  });

  test("builds upward road bands and rejects folds or faces crossing an excluded interior", () => {
    const frames = [
      { point: { x: 0, z: 0 }, tangent: { x: 0, z: 1 } },
      { point: { x: 0, z: 1 }, tangent: { x: 0, z: 1 } },
    ];
    const ribbon = buildTrackRibbon3D(frames, 0.1, -0.1, 0.001);
    expect(ribbon.indices).toHaveLength(6);
    for (let i = 0; i < ribbon.positions.length; i += 9) {
      const [ax, , az, bx, , bz, cx, , cz] = ribbon.positions.slice(i, i + 9);
      expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBeGreaterThan(0);
    }
    const clipped = buildTrackRibbon3D(frames, 0.8, 1.2, 0.001,
      ({ x, z }) => Math.hypot(x - 1, z - 0.5) > 0.1);
    expect(clipped.indices.length).toBeGreaterThan(0);
    for (let i = 0; i < clipped.positions.length; i += 3) {
      expect(Math.hypot(clipped.positions[i] - 1, clipped.positions[i + 2] - 0.5)).toBeGreaterThanOrEqual(0.1);
    }
    expect(buildTrackRibbon3D([...frames].reverse(), -0.1, 0.1, 0.001).indices).toHaveLength(0);
  });
  test("retains a continuous kerb through ordinary curves instead of dropping boundary triangles", () => {
    const frames = Array.from({ length: 81 }, (_, index) => {
      const angle = index / 80 * Math.PI;
      return { point: { x: Math.cos(angle), z: Math.sin(angle) }, tangent: { x: -Math.sin(angle), z: Math.cos(angle) } };
    });
    const ribbon = buildTrackRibbon3D(frames, 0.1, 0.12, 0.001,
      ({ x, z }) => Math.hypot(x, z) >= 1.1 - 0.00015);
    let area = 0;
    for (let i = 0; i < ribbon.positions.length; i += 9) {
      const [ax, , az, bx, , bz, cx, , cz] = ribbon.positions.slice(i, i + 9);
      area += ((bz - az) * (cx - ax) - (bx - ax) * (cz - az)) / 2;
    }
    const expected = Math.PI * (1.12 ** 2 - 1.1 ** 2) / 2;
    expect(area).toBeGreaterThan(expected * 0.98);
    expect(new Set(ribbon.sections).size).toBe(80);
  });

  test("spaces every kerb block by its own offset arc length, including the closed seam", () => {
    const source = Array.from({ length: 81 }, (_, index) => {
      const angle = (index / 80) ** 1.7 * Math.PI * 2;
      return { point: { x: Math.cos(angle), z: Math.sin(angle) }, tangent: { x: -Math.sin(angle), z: Math.cos(angle) } };
    });
    const counts: number[] = [];
    for (const offset of [-0.1, 0.1]) {
      const kerb = spaceKerbFrames3D(source, offset);
      counts.push(kerb.blockCount);
      const lengths = Array.from({ length: kerb.blockCount }, () => 0);
      let widthError = 0;
      for (let index = 0; index < kerb.frames.length - 1; index++) {
        const a = offsetTrackFrame3D(kerb.frames[index], offset);
        const b = offsetTrackFrame3D(kerb.frames[index + 1], offset);
        lengths[kerb.blockIndices[index]] += Math.hypot(b.x - a.x, b.z - a.z);
        const inner = offsetTrackFrame3D(kerb.frames[index], offset - 0.0012);
        const outer = offsetTrackFrame3D(kerb.frames[index], offset + 0.0012);
        widthError = Math.max(widthError, Math.abs(Math.hypot(outer.x - inner.x, outer.z - inner.z) - 0.0024));
      }
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(1e-10);
      expect(Math.abs(lengths[0] - 0.0048)).toBeLessThan(0.00001);
      expect(kerb.blockCount % 2).toBe(0);
      expect(kerb.blockIndices[0]).toBe(0);
      expect(kerb.blockIndices.at(-1)).toBe(kerb.blockCount - 1);
      expect(widthError).toBeLessThan(1e-10);
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
  });

  test("preserves road height and width through kerb spacing and clipped sloped faces", () => {
    const frames = [
      { point: { x: 0, y: 1, z: 0 }, tangent: { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 } },
      { point: { x: 0, y: 2, z: 1 }, tangent: { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 } },
    ];
    const left = offsetTrackFrame3D(frames[0], -0.05);
    const right = offsetTrackFrame3D(frames[0], 0.05);
    expect(right.x - left.x).toBeCloseTo(0.1, 10);
    expect(left.y).toBe(1);
    const ribbon = buildTrackRibbon3D(frames, -0.05, 0.05, 0.001, ({ z }) => z >= 0.3);
    expect(ribbon.indices.length).toBeGreaterThan(0);
    let heightError = 0;
    for (let index = 0; index < ribbon.positions.length; index += 3) {
      heightError = Math.max(heightError, Math.abs(ribbon.positions[index + 1] - ribbon.positions[index + 2] - 1.001));
    }
    expect(heightError).toBeLessThan(1e-10);
    const kerb = spaceKerbFrames3D(frames, 0.05, 0.1);
    const lengths = Array.from({ length: kerb.blockCount }, () => 0);
    for (let index = 0; index < kerb.frames.length - 1; index++) {
      const a = offsetTrackFrame3D(kerb.frames[index], 0.05);
      const b = offsetTrackFrame3D(kerb.frames[index + 1], 0.05);
      lengths[kerb.blockIndices[index]] += Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z);
    }
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(1e-10);
    expect(lengths.reduce((sum, value) => sum + value, 0)).toBeCloseTo(Math.SQRT2, 10);
    expect(kerb.frames.at(-1)?.point.y).toBe(2);
  });

  test("does not clip a bridge's kerbs against a different road level", () => {
    const path = [
      { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 0, y: 0.02, z: -1 }, { x: 0, y: 0.02, z: 1 },
    ];
    const upperKerb = { x: 0.014, y: 0.02, z: 0 };
    // Small differences between adjacent verges must still clip; only the overpass is independent.
    expect(distanceToTrack3D({ x: 0.014, y: 0.005, z: 0 }, path, false, 0.008)).toBe(0);
    expect(distanceToTrack3D(upperKerb, path, false)).toBe(0);
    expect(distanceToTrack3D({ x: 0, y: 0, z: 0.014 }, path, false, Infinity, [2 / 3, 1])).toBeCloseTo(0.014, 10);
    expect(distanceToTrack3D({ x: 0.014, y: 0.01484, z: 0 }, path, false)).toBe(0);
    expect(distanceToTrack3D(upperKerb, path, false, 0.008)).toBeCloseTo(0.014, 10);
    expect(distanceToTrack3D({ x: 0, y: 0, z: 0.014 }, path, false, 0.008)).toBeCloseTo(0.014, 10);
  });

  test("selects the crossing branch from movement or retained route progress", () => {
    const frames = [
      { point: { x: -1, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } },
      { point: { x: 1, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } },
      { point: { x: 0, y: 0.02, z: -1 }, tangent: { x: 0, y: 0, z: 1 } },
      { point: { x: 0, y: 0.02, z: 1 }, tangent: { x: 0, y: 0, z: 1 } },
    ];
    const point = { x: 0, z: 0 };
    expect(projectTrackPosition3D(point, frames, { x: 1, z: 0 })?.point.y).toBe(0);
    expect(projectTrackPosition3D(point, frames, { x: 0, z: 1 })?.point.y).toBe(0.02);
    expect(projectTrackPosition3D(point, frames, undefined, 0.82)?.point.y).toBe(0.02);
    expect(projectTrackPosition3D({ x: 0, z: 0.1 }, frames, undefined, undefined, [2 / 3, 1])?.point.y).toBe(0);
  });

  test("keeps scenery outside complete road segments and leaves the circuit ground level", () => {
    const track = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }];
    expect(distanceToTrack3D({ x: 0.5, z: 0.01 }, track)).toBeCloseTo(0.01);
    expect(distanceToTrack3D({ x: 0.4, z: 0.4 }, track)).toBeCloseTo(0);
    expect(distanceToTrack3D({ x: 0.4, z: 0.4 }, track, false)).toBeCloseTo(0.4);
    expect(distanceToTrack3D({ x: 0, z: 0 }, [])).toBe(Infinity);
    expect(distanceToTrack3D({ x: 1, z: 0 }, [{ x: 0, z: 0 }, { x: 0, z: 0 }])).toBe(1);
    expect(terrainHeight3D(0.5, 0.5, 1)).toBe(0);
    expect(terrainHeight3D(2, 2, 1)).toBeGreaterThan(0);
    const distance = (point: { x: number; z: number }) => distanceToTrack3D(point, track);
    expect(trackFootprintIsClear3D({ x: 0.5, z: -0.1 }, 0, 0.1, 0.25, 0.02, distance)).toBe(false);
    expect(trackFootprintIsClear3D({ x: 0.5, z: -0.2 }, 0, 0.1, 0.2, 0.02, distance)).toBe(true);
  });
  test("keeps the replay orientation and removes only unusable or duplicate points", () => {
    const points = toTrackPoints3D([
      { x: -1, y: -2, z: 7 },
      { x: -1, y: -2, z: 8 },
      { x: 3, y: 4, z: 9 },
      { x: Number.NaN, y: 2, z: 0 },
      { x: -1, y: -2, z: 7 },
    ]);

    expect(points).toEqual([
      { x: -1, z: -2 },
      { x: 3, z: 4 },
    ]);
    expect(getTrackBounds3D(points)).toEqual({
      centerX: 1,
      centerZ: 1,
      width: 4,
      depth: 6,
    });
  });
});


test("steering damps by elapsed time, wraps the shortest way, and snaps on seek", () => {
  const from = Math.PI - 0.1;
  const to = -Math.PI + 0.1;
  const first = smoothTrackAngle3D(from, to, 1 / 60);
  expect(first).toBeGreaterThan(from);
  expect(first - from).toBeLessThan(0.1);
  const twice = smoothTrackAngle3D(first, to, 1 / 60);
  expect(twice).toBeCloseTo(smoothTrackAngle3D(from, to, 1 / 30), 12);
  expect(smoothTrackAngle3D(from, to, 0, true)).toBe(to);
});


test("pit garage rows use clear straight sections and keep a consistent side", () => {
  const frames = Array.from({length:101},(_,i)=>({point:{x:0,z:i*0.002,y:i*0.00001},tangent:{x:0,z:1,y:0.005}}));
  const row=selectPitBoxRow3D(frames,(_frame,side)=>side===1);
  expect(row).toHaveLength(10);
  expect(row.every(bay=>bay.side===1)).toBe(true);
  for(let i=1;i<row.length;i++) expect(row[i].point.z-row[i-1].point.z).toBeCloseTo(0.009,10);
  const compact=selectPitBoxRow3D(frames,(frame,side)=>side===1&&frame.point.z>0.05&&frame.point.z<0.12);
  expect(compact).toHaveLength(10);
  expect(compact[0].spacing).toBeLessThan(0.009);
  expect(compact[0].spacing).toBeGreaterThanOrEqual(0.0065);
  expect(compact.every(bay=>bay.point.z>0.05&&bay.point.z<0.12)).toBe(true);
  expect(selectPitBoxRow3D(frames,()=>false)).toHaveLength(0);
  expect(selectPitBoxRow3D([],()=>true)).toHaveLength(0);
});

test("retaining walls require a sustained real terrain drop, not normal clearance or carving",()=>{
 expect(retainingWallNeeded3D([.002,.002],[.002,.002])).toBe(false);
 expect(retainingWallNeeded3D([.008,.01],[.001,.002])).toBe(false);
 expect(retainingWallNeeded3D([.002,.015],[.002,.014])).toBe(false);
 expect(retainingWallNeeded3D([.012,.011],[.014,.01])).toBe(true);
 expect(retainingWallNeeded3D([.0066,.00605],[.0077,.0055],.003)).toBe(false);
});
