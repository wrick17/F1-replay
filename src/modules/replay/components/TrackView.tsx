import { useMemo } from "react";
import type { NormalizedPosition } from "../utils/telemetry.util";

type DriverRenderState = {
  position: NormalizedPosition | null;
  color: string;
};

type TrackViewProps = {
  trackPath: NormalizedPosition[];
  driverStates: Record<number, DriverRenderState>;
  driverNames: Record<number, string>;
  selectedDrivers: number[];
  className?: string;
};

type Point2D = { x: number; y: number };

const SCALE = 1000;
const LABEL_OFFSET = 80;
const MIN_LABEL_WIDTH = 40;
const LABEL_HEIGHT = 20;
const LABEL_PADDING = 8;
const VIEWBOX_PADDING = 140;
const MIN_SEGMENT_JUMP = 60;
const JUMP_MULTIPLIER = 8;

const toPoint2D = (point: NormalizedPosition): Point2D => ({
  x: point.x * SCALE,
  y: point.y * SCALE,
});

const computeBounds = (points: Point2D[]) => {
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

const computeLabelOffset = (position: Point2D, center: Point2D) => {
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

const buildPathD = (points: Point2D[]) => {
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
      distances.push(
        Math.hypot(point.x - lastValid.x, point.y - lastValid.y),
      );
    }
    lastValid = point;
  });
  const sorted = [...distances].sort((a, b) => a - b);
  const median =
    sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)]
      : MIN_SEGMENT_JUMP;
  const jumpThreshold = Math.max(median * JUMP_MULTIPLIER, MIN_SEGMENT_JUMP);

  let path = "";
  let previous: Point2D | null = null;
  points.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      previous = null;
      return;
    }
    const isFirst = !previous;
    const distance = previous
      ? Math.hypot(point.x - previous.x, point.y - previous.y)
      : 0;
    if (isFirst || distance > jumpThreshold) {
      path += `${path ? " " : ""}M ${point.x} ${point.y}`;
    } else {
      path += ` L ${point.x} ${point.y}`;
    }
    previous = point;
  });
  return path;
};

const getLabelWidth = (text: string) =>
  Math.max(MIN_LABEL_WIDTH, text.length * 7 + LABEL_PADDING * 2);

export const TrackView = ({
  trackPath,
  driverStates,
  driverNames,
  selectedDrivers,
  className,
}: TrackViewProps) => {
  const scaledTrack = useMemo(() => trackPath.map(toPoint2D), [trackPath]);
  const bounds = useMemo(() => computeBounds(scaledTrack), [scaledTrack]);
  const pathD = useMemo(() => buildPathD(scaledTrack), [scaledTrack]);
  const viewBox = useMemo(() => {
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    return `${bounds.minX - VIEWBOX_PADDING} ${
      bounds.minY - VIEWBOX_PADDING
    } ${width + VIEWBOX_PADDING * 2} ${height + VIEWBOX_PADDING * 2}`;
  }, [bounds]);

  return (
    <svg
      className={className}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-label="F1 track replay"
      role="img"
    >
      <rect
        x={bounds.minX - VIEWBOX_PADDING}
        y={bounds.minY - VIEWBOX_PADDING}
        width={bounds.width + VIEWBOX_PADDING * 2}
        height={bounds.height + VIEWBOX_PADDING * 2}
        fill="transparent"
      />
      {pathD && (
        <path
          d={pathD}
          fill="none"
          stroke="#E10600"
          strokeWidth="4"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          shapeRendering="geometricPrecision"
        />
      )}
      {Object.entries(driverStates).map(([driverKey, state]) => {
        if (!state.position) {
          return null;
        }
        const driverNumber = Number(driverKey);
        const position = toPoint2D(state.position);
        const labelText = driverNames[driverNumber] ?? String(driverNumber);
        const labelOffset = computeLabelOffset(position, bounds.center);
        const labelX = position.x + labelOffset.x;
        const labelY = position.y + labelOffset.y;
        const labelWidth = getLabelWidth(labelText);
        const isSelected = selectedDrivers.includes(driverNumber);

        return (
          <g key={driverKey}>
            <line
              x1={position.x}
              y1={position.y}
              x2={labelX}
              y2={labelY}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1"
            />
            <g transform={`translate(${labelX}, ${labelY})`}>
              <rect
                x={-labelWidth / 2}
                y={-LABEL_HEIGHT / 2}
                width={labelWidth}
                height={LABEL_HEIGHT}
                rx="4"
                fill="rgba(0,0,0,0.85)"
                stroke="rgba(255,255,255,0.3)"
              />
              <text
                textAnchor="middle"
                dy="4"
                fill="#FFFFFF"
                fontSize="10"
                fontWeight="600"
                fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
              >
                {labelText}
              </text>
            </g>
            <circle
              cx={position.x}
              cy={position.y}
              r={isSelected ? 8 : 6}
              fill={state.color}
              stroke={isSelected ? "#E10600" : "#FFFFFF"}
              strokeOpacity={isSelected ? 1 : 0.7}
              strokeWidth={isSelected ? "2" : "1"}
            />
          </g>
        );
      })}
    </svg>
  );
};
