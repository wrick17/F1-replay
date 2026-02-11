import type { Point2D, ViewboxBounds } from "./geometry.util";

export const LEADER_LINE_LENGTH = 5;
export const LABEL_ANGLE_STEP_DEGREES = 20;
const LABEL_ANGLE_STEPS = [0, 1, -1, 2, -2, 3, -3, 4, -4] as const;
const HYSTERESIS_MARGIN = 12;
const EPSILON = 1e-6;

export type TrackLabelInput = {
  key: string;
  markerX: number;
  markerY: number;
  labelWidth: number;
  labelHeight: number;
  driverNumber: number;
};

export type TrackLabelPlacement = {
  key: string;
  labelX: number;
  labelY: number;
  leaderEndX: number;
  leaderEndY: number;
  angle: number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const normalizeAngle = (angle: number) => {
  let normalized = angle;
  while (normalized <= -Math.PI) normalized += Math.PI * 2;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  return normalized;
};

const angleDiff = (a: number, b: number) => Math.abs(normalizeAngle(a - b));
const isRightSideAngle = (angle: number) => Math.cos(angle) > EPSILON;

const getOverflow = (
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: ViewboxBounds,
): number => {
  const halfW = width / 2;
  const halfH = height / 2;
  const left = x - halfW;
  const right = x + halfW;
  const top = y - halfH;
  const bottom = y + halfH;

  return (
    Math.max(0, bounds.minX - left) +
    Math.max(0, right - bounds.maxX) +
    Math.max(0, bounds.minY - top) +
    Math.max(0, bottom - bounds.maxY)
  );
};

const expandBounds = (bounds: ViewboxBounds, margin: number): ViewboxBounds => ({
  minX: bounds.minX - margin,
  minY: bounds.minY - margin,
  maxX: bounds.maxX + margin,
  maxY: bounds.maxY + margin,
});

const computeEdgeDistance = (width: number, height: number, ux: number, uy: number) => {
  const halfW = width / 2;
  const halfH = height / 2;
  const tx = Math.abs(ux) > EPSILON ? halfW / Math.abs(ux) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(uy) > EPSILON ? halfH / Math.abs(uy) : Number.POSITIVE_INFINITY;
  return Math.min(tx, ty);
};

const computeCandidate = (
  input: TrackLabelInput,
  angle: number,
  lineLength: number,
): Omit<TrackLabelPlacement, "key"> => {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const edgeDistance = computeEdgeDistance(input.labelWidth, input.labelHeight, ux, uy);

  const leaderEndX = input.markerX + ux * lineLength;
  const leaderEndY = input.markerY + uy * lineLength;
  const centerDistance = lineLength + edgeDistance;

  return {
    labelX: input.markerX + ux * centerDistance,
    labelY: input.markerY + uy * centerDistance,
    leaderEndX,
    leaderEndY,
    angle,
  };
};

const buildAngles = (
  driverNumber: number,
  previousAngle?: number,
): Array<{ angle: number; isPrevious: boolean }> => {
  const step = toRadians(LABEL_ANGLE_STEP_DEGREES);
  const rotationBias = ((driverNumber % 4) - 1.5) * (step / 8);
  const seen = new Set<string>();
  const output: Array<{ angle: number; isPrevious: boolean }> = [];

  const add = (angle: number, isPrevious: boolean) => {
    const normalized = normalizeAngle(angle);
    if (!isRightSideAngle(normalized)) return;
    const key = normalized.toFixed(6);
    if (seen.has(key)) return;
    seen.add(key);
    output.push({ angle: normalized, isPrevious });
  };

  if (previousAngle !== undefined) {
    add(previousAngle, true);
  }

  for (const stepIndex of LABEL_ANGLE_STEPS) {
    const candidate = stepIndex * step + rotationBias;
    add(candidate, false);
  }

  return output;
};

export const placeTrackLabels = (
  labels: TrackLabelInput[],
  _center: Point2D,
  bounds: ViewboxBounds,
  previousAngles?: Map<string, number>,
  lineLength = LEADER_LINE_LENGTH,
) => {
  const nextAngles = new Map<string, number>();
  const placements: TrackLabelPlacement[] = [];
  const relaxedBounds = expandBounds(bounds, HYSTERESIS_MARGIN);

  for (const input of labels) {
    const baseAngle = 0;
    const previous = previousAngles?.get(input.key);
    const angleCandidates = buildAngles(input.driverNumber, previous);

    if (previous !== undefined && isRightSideAngle(previous)) {
      const previousCandidate = computeCandidate(input, previous, lineLength);
      const relaxedOverflow = getOverflow(
        previousCandidate.labelX,
        previousCandidate.labelY,
        input.labelWidth,
        input.labelHeight,
        relaxedBounds,
      );
      if (relaxedOverflow === 0) {
        placements.push({ key: input.key, ...previousCandidate });
        nextAngles.set(input.key, previous);
        continue;
      }
    }

    let best: (TrackLabelPlacement & { score: number }) | null = null;

    for (const { angle, isPrevious } of angleCandidates) {
      const candidate = computeCandidate(input, angle, lineLength);
      const overflow = getOverflow(
        candidate.labelX,
        candidate.labelY,
        input.labelWidth,
        input.labelHeight,
        bounds,
      );
      const score = overflow * 10_000 + angleDiff(angle, baseAngle) * 10 + (isPrevious ? -5 : 0);

      if (!best || score < best.score) {
        best = { key: input.key, ...candidate, score };
      }
    }

    if (!best) {
      const fallback = computeCandidate(input, 0, lineLength);
      placements.push({ key: input.key, ...fallback });
      nextAngles.set(input.key, 0);
      continue;
    }

    placements.push({
      key: input.key,
      labelX: best.labelX,
      labelY: best.labelY,
      leaderEndX: best.leaderEndX,
      leaderEndY: best.leaderEndY,
      angle: best.angle,
    });
    nextAngles.set(input.key, best.angle);
  }

  return { placements, angles: nextAngles };
};
