import type { NormalizedPosition } from "./telemetry.util";

export type Point2D = { x: number; y: number };

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  center: Point2D;
};

export const SCALE = 1000;
export const LABEL_OFFSET = 80;
export const MIN_LABEL_WIDTH = 40;
export const LABEL_HEIGHT = 20;
export const LABEL_PADDING = 8;
export const VIEWBOX_PADDING = 140;

const MIN_SEGMENT_JUMP = 60;
const JUMP_MULTIPLIER = 8;

export const toPoint2D = (point: NormalizedPosition): Point2D => ({
  x: point.x * SCALE,
  y: point.y * SCALE,
});

export const computeBounds = (points: Point2D[]): Bounds => {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  if (!validPoints.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      center: { x: 0, y: 0 },
    };
  }
  const xs = validPoints.map((point) => point.x);
  const ys = validPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
};

export const computeLabelOffset = (position: Point2D, center: Point2D) => {
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const distance = Math.hypot(dx, dy) || 1;
  const normalizedX = dx / distance;
  const normalizedY = dy / distance;
  return {
    x: normalizedX * LABEL_OFFSET,
    y: normalizedY * LABEL_OFFSET,
  };
};

export const buildPathD = (points: Point2D[]) => {
  if (points.length < 2) {
    return "";
  }
  const distances: number[] = [];
  let lastValid: Point2D | null = null;
  points.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      lastValid = null;
      return;
    }
    if (lastValid) {
      distances.push(Math.hypot(point.x - lastValid.x, point.y - lastValid.y));
    }
    lastValid = point;
  });
  const sorted = [...distances].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : MIN_SEGMENT_JUMP;
  const jumpThreshold = Math.max(median * JUMP_MULTIPLIER, MIN_SEGMENT_JUMP);

  let path = "";
  let previous: Point2D | null = null;
  points.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      previous = null;
      return;
    }
    const isFirst = !previous;
    const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    if (isFirst || distance > jumpThreshold) {
      path += `${path ? " " : ""}M ${point.x} ${point.y}`;
    } else {
      path += ` L ${point.x} ${point.y}`;
    }
    previous = point;
  });
  return path;
};

export const getLabelWidth = (text: string) =>
  Math.max(MIN_LABEL_WIDTH, text.length * 7 + LABEL_PADDING * 2);
