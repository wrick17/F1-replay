import { useMemo } from "react";
import type { TrackViewProps } from "../types/replay.types";
import {
  buildPathD,
  computeBounds,
  computeLabelOffset,
  getLabelWidth,
  LABEL_HEIGHT,
  LABEL_OFFSET,
  type LabelRect,
  resolveCollisions,
  toPoint2D,
  VIEWBOX_PADDING,
} from "../utils/geometry.util";

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

  const driverEntries = useMemo(() => {
    return Object.entries(driverStates)
      .filter(([, state]) => state.position !== null)
      .map(([driverKey, state]) => {
        const driverNumber = Number(driverKey);
        // position is guaranteed non-null by the filter above
        const position = toPoint2D(state.position as NonNullable<typeof state.position>);
        const name = driverNames[driverNumber] ?? String(driverNumber);
        const labelText = state.racePosition ? `P${state.racePosition} ${name}` : name;
        const offset = computeLabelOffset(position, bounds.center);
        return {
          driverKey,
          driverNumber,
          position,
          labelText,
          labelWidth: getLabelWidth(labelText),
          initialLabelX: position.x + offset.x,
          initialLabelY: position.y + offset.y,
          color: state.color,
          isSelected: selectedDrivers.includes(driverNumber),
        };
      });
  }, [driverStates, driverNames, bounds.center, selectedDrivers]);

  const resolvedLabels = useMemo(() => {
    if (driverEntries.length === 0) return [];
    const rects: LabelRect[] = driverEntries.map((entry) => ({
      key: entry.driverKey,
      x: entry.initialLabelX,
      y: entry.initialLabelY,
      width: entry.labelWidth,
      height: LABEL_HEIGHT,
      anchorX: entry.position.x,
      anchorY: entry.position.y,
    }));
    return resolveCollisions(rects);
  }, [driverEntries]);

  const labelMap = useMemo(() => {
    const map = new Map<string, LabelRect>();
    for (const label of resolvedLabels) {
      map.set(label.key, label);
    }
    return map;
  }, [resolvedLabels]);

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
      {driverEntries.map((entry) => {
        const resolved = labelMap.get(entry.driverKey);
        const labelX = resolved?.x ?? entry.initialLabelX;
        const labelY = resolved?.y ?? entry.initialLabelY;

        const displacement = Math.hypot(labelX - entry.position.x, labelY - entry.position.y);
        const isFar = displacement > LABEL_OFFSET * 1.5;
        const labelOpacity = isFar ? 0.7 : 1;

        // Use a quadratic bezier for displaced labels to avoid crossing leader lines
        const midX = (entry.position.x + labelX) / 2;
        const midY = (entry.position.y + labelY) / 2;
        const perpX = -(labelY - entry.position.y) * 0.15;
        const perpY = (labelX - entry.position.x) * 0.15;
        const useCurve = displacement > LABEL_OFFSET * 1.2;

        return (
          <g key={entry.driverKey}>
            {useCurve ? (
              <path
                d={`M ${entry.position.x} ${entry.position.y} Q ${midX + perpX} ${midY + perpY} ${labelX} ${labelY}`}
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1"
              />
            ) : (
              <line
                x1={entry.position.x}
                y1={entry.position.y}
                x2={labelX}
                y2={labelY}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="1"
              />
            )}
            <g transform={`translate(${labelX}, ${labelY})`} opacity={labelOpacity}>
              <rect
                x={-entry.labelWidth / 2}
                y={-LABEL_HEIGHT / 2}
                width={entry.labelWidth}
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
                {entry.labelText}
              </text>
            </g>
            <circle
              cx={entry.position.x}
              cy={entry.position.y}
              r={entry.isSelected ? 8 : 6}
              fill={entry.color}
              stroke={entry.isSelected ? "#E10600" : "#FFFFFF"}
              strokeOpacity={entry.isSelected ? 1 : 0.7}
              strokeWidth={entry.isSelected ? "2" : "1"}
            />
          </g>
        );
      })}
    </svg>
  );
};
