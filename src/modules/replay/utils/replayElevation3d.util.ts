import catalog from "../data/circuitElevations.json";
import { REPLAY_ELEVATION_SCALE_3D, type TrackPoint3D } from "./track3d.util";

export type ReplayBridge3D = {
  upperProgress: number;
  lowerProgress: number;
  halfLength: number;
  center: { x: number; z: number };
};

export type ReplayElevationProfile3D = {
  circuitKey: number;
  geometry: { referencePlanarLengthRaw: number; anchors: number[][] };
  samples: number[][];
  crossing?: {
    upperProgress: number;
    lowerProgress: number;
    upperRelativeZRaw: number;
    lowerRelativeZRaw: number;
  };
};

/** Match ordered geometry as well as the circuit key; alternate layouts cannot share profiles blindly. */
export const matchReplayElevationProfile3D = (
  points: TrackPoint3D[],
  circuitKey: number | undefined,
  profiles: ReplayElevationProfile3D[],
) => {
  if (points.length < 3 || circuitKey === undefined) return undefined;
  const distances = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1];
    const b = points[i % points.length];
    distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = distances[points.length];
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return profiles.find(
    (profile) =>
      profile.circuitKey === circuitKey &&
      profile.geometry.anchors.length >= 12 &&
      profile.geometry.anchors.every(([progress, x, z]) => {
        if (!Number.isFinite(progress) || progress < 0 || progress >= 1) return false;
        const distance = progress * total;
        let segment = 0;
        while (segment < points.length - 1 && distances[segment + 1] < distance) segment++;
        const a = points[segment];
        const b = points[(segment + 1) % points.length];
        const fraction =
          (distance - distances[segment]) /
          Math.max(1e-10, distances[segment + 1] - distances[segment]);
        return (
          Math.hypot(a.x + (b.x - a.x) * fraction - x, a.z + (b.z - a.z) * fraction - z) <= 0.003
        );
      }),
  );
};

/** Apply the matched archive profile along ordered lap distance, with optional overpass clearance. */
export const elevateReplayTrack3D = (
  points: TrackPoint3D[],
  circuitKey?: number,
  profiles: ReplayElevationProfile3D[] = catalog.profiles,
): { points: TrackPoint3D[]; bridge?: ReplayBridge3D } => {
  const elevation = matchReplayElevationProfile3D(points, circuitKey, profiles);
  if (!elevation || elevation.samples.length < 2) return { points };
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(
      distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z),
    );
  }
  const total =
    distances[distances.length - 1] +
    Math.hypot(
      points[0].x - points[points.length - 1].x,
      points[0].z - points[points.length - 1].z,
    );
  if (!Number.isFinite(total) || total <= 0) return { points };
  // Exaggerate relief so grades and the overpass read at miniature overview scale.
  const scale = (total / elevation.geometry.referencePlanarLengthRaw) * REPLAY_ELEVATION_SCALE_3D;
  const crossing = elevation.crossing;
  const upperProgress = crossing?.upperProgress ?? 0;
  const halfLength = 0.045;
  // The miniature cars are enlarged relative to the circuit. Keep the scaled
  // profile elsewhere, with enough local bridge clearance for their bodywork.
  const lift = crossing
    ? Math.max(0, 0.018 - (crossing.upperRelativeZRaw - crossing.lowerRelativeZRaw) * scale)
    : 0;
  let sample = 0;
  const elevated = points.map((point, index) => {
    const progress = distances[index] / total;
    while (sample < elevation.samples.length - 2 && elevation.samples[sample + 1][0] < progress)
      sample++;
    const [a, b] = [elevation.samples[sample], elevation.samples[sample + 1]];
    const fraction = Math.max(0, Math.min(1, (progress - a[0]) / (b[0] - a[0])));
    const separation = Math.abs(progress - upperProgress);
    const distance = Math.min(separation, 1 - separation) * total;
    const fade = Math.max(0, Math.min(1, (distance - halfLength) / (0.2 - halfLength)));
    const bridgeLift = lift * (1 - fade * fade * (3 - 2 * fade));
    return { ...point, y: (a[1] + (b[1] - a[1]) * fraction) * scale + bridgeLift };
  });
  if (!crossing) return { points: elevated };
  const bridgeDistance = upperProgress * total;
  let index = 0;
  while (index < points.length - 2 && distances[index + 1] < bridgeDistance) index++;
  const a = points[index];
  const b = points[index + 1];
  const fraction = (bridgeDistance - distances[index]) / (distances[index + 1] - distances[index]);
  return {
    points: elevated,
    bridge: {
      upperProgress,
      lowerProgress: crossing.lowerProgress,
      halfLength,
      center: { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction },
    },
  };
};
