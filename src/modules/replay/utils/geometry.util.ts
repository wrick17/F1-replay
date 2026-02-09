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
export const LABEL_OFFSET = 55;
export const MIN_LABEL_WIDTH = 50;
export const LABEL_HEIGHT = 24;
export const LABEL_PADDING = 10;
export const VIEWBOX_PADDING = 80;

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
  Math.max(MIN_LABEL_WIDTH, text.length * 8.5 + LABEL_PADDING * 2);

export type LabelRect = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
};

const COLLISION_PAD = 10;
const MAX_ITERATIONS = 160;
const DOT_OBSTACLE_SIZE = 16;

const rectsOverlap = (a: LabelRect, b: LabelRect): boolean => {
  const aLeft = a.x - a.width / 2 - COLLISION_PAD;
  const aRight = a.x + a.width / 2 + COLLISION_PAD;
  const aTop = a.y - a.height / 2 - COLLISION_PAD;
  const aBottom = a.y + a.height / 2 + COLLISION_PAD;
  const bLeft = b.x - b.width / 2 - COLLISION_PAD;
  const bRight = b.x + b.width / 2 + COLLISION_PAD;
  const bTop = b.y - b.height / 2 - COLLISION_PAD;
  const bBottom = b.y + b.height / 2 + COLLISION_PAD;
  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
};

const clampToViewbox = (labels: LabelRect[], viewbox?: ViewboxBounds) => {
  if (!viewbox) return;
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const halfW = label.width / 2;
    const halfH = label.height / 2;
    label.x = Math.max(viewbox.minX + halfW, Math.min(viewbox.maxX - halfW, label.x));
    label.y = Math.max(viewbox.minY + halfH, Math.min(viewbox.maxY - halfH, label.y));
  }
};

const sweepLayout = (labels: LabelRect[], viewbox?: ViewboxBounds) => {
  const ordered = [...labels].sort((a, b) => a.y - b.y);
  const sweepPad = COLLISION_PAD * 2 + 2;
  const maxPasses = 6;

  const hasOverlap = () => {
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        if (rectsOverlap(ordered[i], ordered[j])) return true;
      }
    }
    return false;
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    for (let i = 1; i < ordered.length; i++) {
      const cur = ordered[i];
      for (let j = i - 1; j >= 0; j--) {
        const prev = ordered[j];
        if (!rectsOverlap(cur, prev)) continue;
        cur.y = prev.y + (prev.height + cur.height) / 2 + sweepPad;
      }
    }
    clampToViewbox(ordered, viewbox);

    for (let i = ordered.length - 2; i >= 0; i--) {
      const cur = ordered[i];
      for (let j = i + 1; j < ordered.length; j++) {
        const next = ordered[j];
        if (!rectsOverlap(cur, next)) continue;
        cur.y = next.y - (next.height + cur.height) / 2 - sweepPad;
      }
    }
    clampToViewbox(ordered, viewbox);

    if (!hasOverlap()) break;
  }

  if (hasOverlap()) {
    const maxWidth = Math.max(...ordered.map((label) => label.width));
    const columnShift = maxWidth * 0.5 + COLLISION_PAD * 3;
    for (let i = 0; i < ordered.length; i++) {
      ordered[i].x += i % 2 === 0 ? -columnShift : columnShift;
    }
    clampToViewbox(ordered, viewbox);

    for (let pass = 0; pass < maxPasses; pass++) {
      for (let i = 1; i < ordered.length; i++) {
        const cur = ordered[i];
        for (let j = i - 1; j >= 0; j--) {
          const prev = ordered[j];
          if (!rectsOverlap(cur, prev)) continue;
          cur.y = prev.y + (prev.height + cur.height) / 2 + sweepPad;
        }
      }
      clampToViewbox(ordered, viewbox);

      for (let i = ordered.length - 2; i >= 0; i--) {
        const cur = ordered[i];
        for (let j = i + 1; j < ordered.length; j++) {
          const next = ordered[j];
          if (!rectsOverlap(cur, next)) continue;
          cur.y = next.y - (next.height + cur.height) / 2 - sweepPad;
        }
      }
      clampToViewbox(ordered, viewbox);

      if (!hasOverlap()) break;
    }
  }
};

export type ViewboxBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const clampWithSoftMargin = (value: number, min: number, max: number, margin: number) => {
  if (value < min) return min + (min - value) * margin;
  if (value > max) return max - (value - max) * margin;
  return value;
};

const attractLabel = (label: LabelRect, target: Point2D, strength: number) => {
  label.x += (target.x - label.x) * strength;
  label.y += (target.y - label.y) * strength;
};

export const resolveCollisions = (
  labels: LabelRect[],
  bounds?: Bounds,
  viewbox?: ViewboxBounds,
): LabelRect[] => {
  const iterationCount = Math.max(MAX_ITERATIONS, labels.length * 4);
  const result = labels.map((label) => ({ ...label }));
  const center = bounds?.center ?? { x: 0, y: 0 };

  for (let iter = 0; iter < iterationCount; iter++) {
    let moved = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];
        if (!rectsOverlap(a, b)) continue;
        moved = true;
        const dx = a.x - b.x || (a.x > center.x ? 1 : -1);
        const dy = a.y - b.y || (a.y > center.y ? 1 : -1);
        const distance = Math.hypot(dx, dy) || 1;
        const push = 3 + (LABEL_HEIGHT / distance) * 2;
        const pushX = (dx / distance) * push;
        const pushY = (dy / distance) * push;
        a.x += pushX;
        a.y += pushY;
        b.x -= pushX;
        b.y -= pushY;
      }
    }

    for (const label of result) {
      const anchor = { x: label.anchorX, y: label.anchorY };
      const dx = label.x - anchor.x;
      const dy = label.y - anchor.y;
      const distance = Math.hypot(dx, dy) || 1;
      const pull = Math.max(0, distance - LABEL_OFFSET);
      label.x -= (dx / distance) * pull * 0.01;
      label.y -= (dy / distance) * pull * 0.01;
      if (viewbox) {
        label.x = clampWithSoftMargin(label.x, viewbox.minX, viewbox.maxX, 0.2);
        label.y = clampWithSoftMargin(label.y, viewbox.minY, viewbox.maxY, 0.2);
      }
    }

    for (const label of result) {
      for (const other of result) {
        if (label === other) continue;
        const dx = label.anchorX - other.anchorX;
        const dy = label.anchorY - other.anchorY;
        if (Math.hypot(dx, dy) < DOT_OBSTACLE_SIZE) {
          label.x += dx * 0.05;
          label.y += dy * 0.05;
          moved = true;
        }
      }
    }

    for (const label of result) {
      attractLabel(label, { x: label.anchorX, y: label.anchorY }, 0.0025);
    }

    if (!moved) break;
  }

  sweepLayout(result, viewbox);

  if (viewbox) {
    clampToViewbox(result, viewbox);
  }

  return result;
};

export const smoothLabels = (prev: LabelRect[], next: LabelRect[], factor: number) => {
  const map = new Map(prev.map((label) => [label.key, label]));
  return next.map((label) => {
    const previous = map.get(label.key);
    if (!previous) return label;
    return {
      ...label,
      x: previous.x + (label.x - previous.x) * factor,
      y: previous.y + (label.y - previous.y) * factor,
    };
  });
};
