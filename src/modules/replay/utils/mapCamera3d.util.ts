import { type PerspectiveCamera, Spherical, Vector3 } from "three/webgpu";
import type { MapPolygon } from "../types/circuitSurroundings.types";
import { mapContainsPoint } from "./circuitMapGeometry.util";
import { distanceToTrack3D } from "./track3d.util";

/** Preserve the chosen side angle; constrain exploration while boundary haze hides distant map edges. */
export const constrainMapCamera3D = (
  camera: PerspectiveCamera,
  target: Vector3,
  coverage: MapPolygon | undefined,
  center: Vector3,
  span: number,
  minimumDistance: number,
  maximumDistance: number,
) => {
  const offset = camera.position.clone().sub(target);
  target.x = Math.max(center.x - span * 0.8, Math.min(center.x + span * 0.8, target.x));
  target.z = Math.max(center.z - span * 0.8, Math.min(center.z + span * 0.8, target.z));
  target.y = Math.max(center.y - span * 0.2, Math.min(center.y + span * 0.2, target.y));
  const boundary = coverage?.[0].map(([x, z]) => ({ x, z })) ?? [];
  const inside = (point: Vector3) =>
    !coverage ||
    (mapContainsPoint([point.x, point.z], coverage) &&
      distanceToTrack3D(point, boundary) > span * 0.15);
  if (!inside(target)) {
    const requested = target.clone();
    let low = 0,
      high = 1;
    for (let i = 0; i < 24; i++) {
      const fraction = (low + high) / 2;
      target.copy(center).lerp(requested, fraction);
      if (inside(target)) low = fraction;
      else high = fraction;
    }
    target.copy(center).lerp(requested, low);
  }
  const spherical = new Spherical().setFromVector3(offset);
  spherical.phi = Math.max(Math.PI * 0.025, Math.min((Math.PI * 78) / 180, spherical.phi));
  const place = (radius: number) =>
    camera.position
      .copy(target)
      .add(new Vector3().setFromSpherical(new Spherical(radius, spherical.phi, spherical.theta)));
  place(maximumDistance);
  if (!inside(camera.position)) {
    let low = minimumDistance,
      high = maximumDistance;
    for (let i = 0; i < 24; i++) {
      const radius = (low + high) / 2;
      place(radius);
      if (inside(camera.position)) low = radius;
      else high = radius;
    }
    maximumDistance = low;
  }
  place(Math.max(minimumDistance, Math.min(maximumDistance, spherical.radius)));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return maximumDistance;
};

/** Match the 2D map's X-right/Z-down orientation, then fit the actual projected course in the HUD gap. */
export const fitTrackOverviewCamera3D = (
  camera: PerspectiveCamera,
  target: Vector3,
  points: { x: number; y?: number; z: number }[],
  widthFraction: number,
  heightFraction: number,
) => {
  const vertices = points.map((p) => new Vector3(p.x, p.y ?? 0, p.z));
  const radius = Math.max(0.01, ...vertices.map((p) => p.distanceTo(target)));
  const offset = new Vector3(0, 1, 0.28).normalize();
  const place = (distance: number) => {
    camera.position.copy(target).addScaledVector(offset, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const fits = (distance: number) => {
    place(distance);
    const screenCenter = target.clone().project(camera);
    return vertices.every((p) => {
      const projected = p.clone().project(camera);
      return (
        Math.abs(projected.x - screenCenter.x) <= widthFraction * 0.92 &&
        Math.abs(projected.y - screenCenter.y) <= heightFraction * 0.92 &&
        projected.z < 1
      );
    });
  };
  let low = radius * 1.01,
    high = radius * 64;
  for (let i = 0; i < 24; i++) {
    const distance = (low + high) / 2;
    if (fits(distance)) high = distance;
    else low = distance;
  }
  place(high);
  return high;
};
