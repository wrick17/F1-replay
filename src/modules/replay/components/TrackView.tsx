import { useEffect, useMemo, useRef, useState } from "react";
import type { TrackViewProps } from "../types/replay.types";
import {
  buildPathD,
  computeBounds,
  computeLabelOffset,
  getLabelWidth,
  LABEL_HEIGHT,
  type LabelRect,
  resolveCollisions,
  smoothLabels,
  toPoint2D,
  VIEWBOX_PADDING,
  type ViewboxBounds,
} from "../utils/geometry.util";

type LabelWorkerRequest = {
  type: "resolve";
  requestId: number;
  payload: {
    labels: LabelRect[];
    viewbox?: ViewboxBounds | null;
  };
};

type LabelWorkerResponse = {
  type: "resolved";
  requestId: number;
  payload: LabelRect[];
};

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

  const prevLabelsRef = useRef<LabelRect[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const latestRequestRef = useRef(0);
  const [resolvedLabels, setResolvedLabels] = useState<LabelRect[]>([]);

  // Inset the clamping bounds so labels stay away from edges that overlap UI panels
  const LABEL_SAFE_INSET = 64;
  const viewboxBounds: ViewboxBounds = useMemo(
    () => ({
      minX: bounds.minX - VIEWBOX_PADDING + LABEL_SAFE_INSET,
      minY: bounds.minY - VIEWBOX_PADDING + LABEL_SAFE_INSET,
      maxX: bounds.maxX + VIEWBOX_PADDING - LABEL_SAFE_INSET,
      maxY: bounds.maxY + VIEWBOX_PADDING - LABEL_SAFE_INSET,
    }),
    [bounds],
  );

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }
    const worker = new Worker(new URL("../workers/labelPlacement.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<LabelWorkerResponse>) => {
      const message = event.data;
      if (message.type !== "resolved") return;
      if (message.requestId !== latestRequestRef.current) return;
      const smoothed = smoothLabels(prevLabelsRef.current, message.payload, 0.2);
      prevLabelsRef.current = smoothed;
      setResolvedLabels(smoothed);
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (driverEntries.length === 0) {
      prevLabelsRef.current = [];
      setResolvedLabels([]);
      return;
    }

    const prevMap = new Map<string, LabelRect>();
    for (const label of prevLabelsRef.current) {
      prevMap.set(label.key, label);
    }
    const hasPrev = prevMap.size > 0;
    const smoothFactor = 0.18;

    // Build rects starting from previous resolved positions (if available)
    // and gently pulling toward new ideal positions.
    // Since previous positions are already non-overlapping, collision
    // resolution only needs small adjustments -> stable, no jumping.
    const rects: LabelRect[] = driverEntries.map((entry) => {
      const targetX = entry.initialLabelX;
      const targetY = entry.initialLabelY;
      const prev = hasPrev ? prevMap.get(entry.driverKey) : undefined;

      return {
        key: entry.driverKey,
        x: prev ? prev.x + (targetX - prev.x) * smoothFactor : targetX,
        y: prev ? prev.y + (targetY - prev.y) * smoothFactor : targetY,
        width: entry.labelWidth,
        height: LABEL_HEIGHT,
        anchorX: entry.position.x,
        anchorY: entry.position.y,
      };
    });

    const worker = workerRef.current;
    if (!worker) {
      const resolved = resolveCollisions(rects, undefined, viewboxBounds);
      const smoothed = smoothLabels(prevLabelsRef.current, resolved, 0.2);
      prevLabelsRef.current = smoothed;
      setResolvedLabels(smoothed);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    latestRequestRef.current = requestId;
    const message: LabelWorkerRequest = {
      type: "resolve",
      requestId,
      payload: {
        labels: rects,
        viewbox: viewboxBounds,
      },
    };
    worker.postMessage(message);
  }, [driverEntries, viewboxBounds]);

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
        const colorBarWidth = 4;

        return (
          <g key={entry.driverKey}>
            {/* Leader line in driver team color */}
            <line
              x1={entry.position.x}
              y1={entry.position.y}
              x2={labelX}
              y2={labelY}
              stroke={entry.color}
              strokeWidth="1"
              strokeOpacity={0.5}
            />
            {/* Label pill */}
            <g transform={`translate(${labelX}, ${labelY})`}>
              <rect
                x={-entry.labelWidth / 2}
                y={-LABEL_HEIGHT / 2}
                width={entry.labelWidth}
                height={LABEL_HEIGHT}
                rx="4"
                fill="rgba(0,0,0,0.85)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="0.8"
              />
              {/* Color accent bar on left edge */}
              <rect
                x={-entry.labelWidth / 2}
                y={-LABEL_HEIGHT / 2}
                width={colorBarWidth}
                height={LABEL_HEIGHT}
                rx="4"
                fill={entry.color}
              />
              {/* Cover the right-side rounding of the color bar */}
              <rect
                x={-entry.labelWidth / 2 + colorBarWidth - 2}
                y={-LABEL_HEIGHT / 2}
                width={4}
                height={LABEL_HEIGHT}
                fill="rgba(0,0,0,0.85)"
              />
              <text
                textAnchor="middle"
                x={colorBarWidth / 2}
                dy="4.5"
                fill="#FFFFFF"
                fontSize="13"
                fontWeight="600"
                fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
              >
                {entry.labelText}
              </text>
            </g>
            {/* Driver dot */}
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
