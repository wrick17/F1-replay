import { useMemo } from "react";
import type { TrackViewProps } from "../types/replay.types";
import {
  buildPathD,
  computeBounds,
  computeLabelOffset,
  getLabelWidth,
  LABEL_HEIGHT,
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
        const name = driverNames[driverNumber] ?? String(driverNumber);
        const labelText = state.racePosition ? `P${state.racePosition} ${name}` : name;
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
