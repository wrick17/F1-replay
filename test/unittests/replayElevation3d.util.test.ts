import { expect, test } from "bun:test";
import catalog from "../../src/modules/replay/data/circuitElevations.json";
import { elevateReplayTrack3D, matchReplayElevationProfile3D } from "../../src/modules/replay/utils/replayElevation3d.util";

const lap = Array.from({ length: 1000 }, (_, i) => ({
  x: Math.cos(i / 1000 * Math.PI * 2),
  z: Math.sin(i / 1000 * Math.PI * 2),
}));

const sourceProfile = catalog.profiles.find(profile => profile.circuitKey === 46)!;
const profile = { circuitKey: 46, samples: sourceProfile.samples, crossing: sourceProfile.crossing, geometry: { referencePlanarLengthRaw: sourceProfile.geometry.referencePlanarLengthRaw, anchors: Array.from({ length: 20 }, (_, i) => [i / 20, lap[i * 50].x, lap[i * 50].z]) } };

test("Suzuka profile has distinct crossing levels, a closed seam and scale-independent relief", () => {
  const { points, bridge } = elevateReplayTrack3D(lap, 46, [profile]);
  expect(bridge).toBeDefined();
  const lower = points[Math.round(bridge!.lowerProgress * 1000)].y!;
  const upper = points[Math.round(bridge!.upperProgress * 1000)].y!;
  expect(upper).toBeGreaterThan(lower);
  const miniatureProfile = { ...profile, geometry: { ...profile.geometry, anchors: profile.geometry.anchors.map(([p, x, z]) => [p, x * 0.45, z * 0.45]) } };
  const miniature = elevateReplayTrack3D(lap.map(p => ({ x: p.x * 0.45, z: p.z * 0.45 })), 46, [miniatureProfile]);
  expect(miniature.points[Math.round(bridge!.upperProgress * 1000)].y! - miniature.points[Math.round(bridge!.lowerProgress * 1000)].y!).toBeGreaterThanOrEqual(0.01799);
  const enlargedProfile = { ...profile, geometry: { ...profile.geometry, anchors: profile.geometry.anchors.map(([p, x, z]) => [p, x * 2 + 3, z * 2 - 4]) } };
  const enlarged = elevateReplayTrack3D(lap.map(p => ({ x: p.x * 2 + 3, z: p.z * 2 - 4 })), 46, [enlargedProfile]);
  expect(enlarged.points[400].y!).toBeCloseTo(points[400].y! * 2, 10);
  expect(profile.samples[0][0]).toBe(0);
  expect(profile.samples.at(-1)![0]).toBe(1);
  expect(profile.samples[0][1]).toBe(profile.samples.at(-1)![1]);
  expect(profile.samples.every((p, i) => Number.isFinite(p[1]) && (i === 0 || p[0] > profile.samples[i - 1][0]))).toBe(true);
  expect(elevateReplayTrack3D(lap, 2).points).toBe(lap);
  expect(elevateReplayTrack3D([{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }], 46).bridge).toBeUndefined();
});


test("profile selection rejects alternate geometry, direction and start while accepting resampling", () => {
  const path = Array.from({ length: 120 }, (_, i) => ({ x: Math.cos(i / 120 * Math.PI * 2) * 0.4, z: Math.sin(i / 120 * Math.PI * 2) * 0.4 }));
  const sourceProfile = catalog.profiles.find(profile => profile.circuitKey === 46)!;
const profile = { circuitKey: 9, geometry: { referencePlanarLengthRaw: 1000, anchors: Array.from({ length: 12 }, (_, i) => [i / 12, path[i * 10].x, path[i * 10].z]) }, samples: [[0, 0], [0.5, 12], [1, 0]] };
  expect(matchReplayElevationProfile3D(path, 9, [profile])).toBe(profile);
  const resampled = path.flatMap((point, i) => [point, { x: (point.x + path[(i + 1) % path.length].x) / 2, z: (point.z + path[(i + 1) % path.length].z) / 2 }]);
  expect(matchReplayElevationProfile3D(resampled, 9, [profile])).toBe(profile);
  expect(matchReplayElevationProfile3D(path, 10, [profile])).toBeUndefined();
  expect(matchReplayElevationProfile3D(path.map(p => ({ ...p, x: p.x * 0.7 })), 9, [profile])).toBeUndefined();
  expect(matchReplayElevationProfile3D([...path].reverse(), 9, [profile])).toBeUndefined();
  expect(matchReplayElevationProfile3D([...path.slice(15), ...path.slice(0, 15)], 9, [profile])).toBeUndefined();
});


test("all bundled layouts have usable closed elevation profiles", () => {
  expect(catalog.profiles).toHaveLength(24);
  expect(catalog.gaps).toHaveLength(0);
  for (const profile of catalog.profiles) {
    expect(profile.geometry.referencePlanarLengthRaw).toBeGreaterThan(0);
    expect(profile.geometry.anchors).toHaveLength(12);
    expect(profile.samples[0][0]).toBe(0);
    expect(profile.samples.at(-1)![0]).toBe(1);
    expect(profile.samples.at(-1)![1]).toBe(profile.samples[0][1]);
    expect(profile.samples.every(([progress, z], i) => Number.isFinite(z) && (i === 0 || progress > profile.samples[i - 1][0]))).toBe(true);
  }
});

test("non-Suzuka profiles elevate roads without adding a bridge", () => {
  const generic = { ...profile, circuitKey: 2, crossing: undefined };
  const result = elevateReplayTrack3D(lap, 2, [generic]);
  expect(result.points.some(point => (point.y ?? 0) > 0)).toBe(true);
  expect(result.bridge).toBeUndefined();
  expect(result.points.map(({x,z}) => ({x,z}))).toEqual(lap);
  expect(elevateReplayTrack3D(lap, 46).points).toBe(lap);
});

test("recorded relief is reduced 45 percent while horizontal geometry stays exact",()=>{
 const generic = { ...profile, circuitKey: 2, crossing: undefined };
 const result=elevateReplayTrack3D(lap,2,[generic]);
 const planarLength=lap.reduce((sum,point,i)=>sum+Math.hypot(point.x-lap[(i+1)%lap.length].x,point.z-lap[(i+1)%lap.length].z),0);
 for(const i of [0,100,250,400,600,900]){
  const progress=i/lap.length;
  let sample=0;while(sample<generic.samples.length-2&&generic.samples[sample+1][0]<progress)sample++;
  const [a,b]=[generic.samples[sample],generic.samples[sample+1]];
  const raw=a[1]+(b[1]-a[1])*(progress-a[0])/(b[0]-a[0]);
  const priorHeight=raw*planarLength/generic.geometry.referencePlanarLengthRaw*3;
  expect(result.points[i].y!).toBeCloseTo(priorHeight*.55,10);
  expect(result.points[i].x).toBe(lap[i].x);expect(result.points[i].z).toBe(lap[i].z);
 }
});
