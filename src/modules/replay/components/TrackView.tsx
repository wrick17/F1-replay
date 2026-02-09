import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { TrackViewProps } from "../types/replay.types";
import {
  buildPathD,
  computeBounds,
  computeLabelOffset,
  getLabelWidth,
  LABEL_HEIGHT,
  LABEL_PADDING,
  type LabelRect,
  resolveCollisions,
  smoothLabels,
  toPoint2D,
  VIEWBOX_PADDING,
  type ViewboxBounds,
} from "../utils/geometry.util";

const LABEL_LOGO_SIZE = 18;
const LABEL_LOGO_GAP = 6;
const MAX_POSITION_LABEL = "20";

type TrackSegment = {
  d: string;
  color: string;
  key: string;
};

type TrackBaseProps = {
  bounds: ViewboxBounds;
  trackSegments: TrackSegment[];
  pathD: string;
};

const TrackBase = memo(({ bounds, trackSegments, pathD }: TrackBaseProps) => (
  <>
    <rect
      x={bounds.minX - VIEWBOX_PADDING}
      y={bounds.minY - VIEWBOX_PADDING}
      width={bounds.width + VIEWBOX_PADDING * 2}
      height={bounds.height + VIEWBOX_PADDING * 2}
      fill="transparent"
    />
    {trackSegments.length > 0 ? (
      <g shapeRendering="geometricPrecision">
        {trackSegments.map((segment) => (
          <path
            key={segment.key}
            d={segment.d}
            fill="none"
            stroke={segment.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    ) : (
      pathD && (
        <path
          d={pathD}
          fill="none"
          stroke="#E10600"
          strokeWidth="4"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          shapeRendering="geometricPrecision"
        />
      )
    )}
  </>
));

const ELEVATION_LOW = { r: 34, g: 197, b: 94 };
const ELEVATION_MID = { r: 234, g: 179, b: 8 };
const ELEVATION_HIGH = { r: 225, g: 6, b: 0 };
const MIN_SEGMENT_JUMP = 60;
const JUMP_MULTIPLIER = 8;

const toHex = (value: number) => value.toString(16).padStart(2, "0");
const lerp = (start: number, end: number, t: number) => Math.round(start + (end - start) * t);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const mix = (start: typeof ELEVATION_LOW, end: typeof ELEVATION_LOW, t: number) => ({
  r: lerp(start.r, end.r, t),
  g: lerp(start.g, end.g, t),
  b: lerp(start.b, end.b, t),
});
const toHexColor = (rgb: typeof ELEVATION_LOW) => `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
const elevationColor = (t: number) => {
  const clamped = clamp01(t);
  if (clamped <= 0.5) {
    return toHexColor(mix(ELEVATION_LOW, ELEVATION_MID, clamped / 0.5));
  }
  return toHexColor(mix(ELEVATION_MID, ELEVATION_HIGH, (clamped - 0.5) / 0.5));
};
const quantizeElevation = (t: number, steps = 48) => {
  const clamped = clamp01(t);
  return Math.round(clamped * steps) / steps;
};

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
  driverTeams,
  selectedDrivers,
  className,
}: TrackViewProps) => {
  const scaledTrack = useMemo(
    () => trackPath.map((point) => ({ ...toPoint2D(point), z: point.z })),
    [trackPath],
  );
  const bounds = useMemo(() => computeBounds(scaledTrack), [scaledTrack]);
  const pathD = useMemo(() => buildPathD(scaledTrack), [scaledTrack]);
  const trackSegments = useMemo((): TrackSegment[] => {
    const validPoints = scaledTrack.filter(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z),
    );
    if (!validPoints.length) {
      return [];
    }
    const minZ = Math.min(...validPoints.map((point) => point.z));
    const maxZ = Math.max(...validPoints.map((point) => point.z));
    const range = maxZ - minZ || 1;
    const distances: number[] = [];
    let lastValid: (typeof scaledTrack)[number] | null = null;
    for (const point of scaledTrack) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        lastValid = null;
        continue;
      }
      if (lastValid) {
        distances.push(Math.hypot(point.x - lastValid.x, point.y - lastValid.y));
      }
      lastValid = point;
    }
    const sorted = [...distances].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : MIN_SEGMENT_JUMP;
    const jumpThreshold = Math.max(median * JUMP_MULTIPLIER, MIN_SEGMENT_JUMP);
    const segments: TrackSegment[] = [];
    let previous: (typeof scaledTrack)[number] | null = null;
    let currentSegment: { d: string; color: string; start: { x: number; y: number } } | null = null;

    for (const point of scaledTrack) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        if (currentSegment) {
          segments.push({
            d: currentSegment.d,
            color: currentSegment.color,
            key: `${currentSegment.start.x}-${currentSegment.start.y}-${currentSegment.color}`,
          });
          currentSegment = null;
        }
        previous = null;
        continue;
      }
      if (previous) {
        const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
        if (distance > jumpThreshold) {
          if (currentSegment) {
            segments.push({
              d: currentSegment.d,
              color: currentSegment.color,
              key: `${currentSegment.start.x}-${currentSegment.start.y}-${currentSegment.color}`,
            });
            currentSegment = null;
          }
          previous = point;
          continue;
        }
        const z = (previous.z + point.z) / 2;
        const t = quantizeElevation((z - minZ) / range);
        const color = elevationColor(t);
        if (!currentSegment || currentSegment.color !== color) {
          if (currentSegment) {
            segments.push({
              d: currentSegment.d,
              color: currentSegment.color,
              key: `${currentSegment.start.x}-${currentSegment.start.y}-${currentSegment.color}`,
            });
          }
          currentSegment = {
            d: `M ${previous.x} ${previous.y} L ${point.x} ${point.y}`,
            color,
            start: { x: previous.x, y: previous.y },
          };
        } else {
          currentSegment.d += ` L ${point.x} ${point.y}`;
        }
      }
      previous = point;
    }
    if (currentSegment) {
      segments.push({
        d: currentSegment.d,
        color: currentSegment.color,
        key: `${currentSegment.start.x}-${currentSegment.start.y}-${currentSegment.color}`,
      });
    }
    return segments;
  }, [scaledTrack]);
  const viewBox = useMemo(() => {
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    return `${bounds.minX - VIEWBOX_PADDING} ${
      bounds.minY - VIEWBOX_PADDING
    } ${width + VIEWBOX_PADDING * 2} ${height + VIEWBOX_PADDING * 2}`;
  }, [bounds]);

  const labelWidthMap = useMemo(() => {
    const map = new Map<number, number>();
    Object.entries(driverNames).forEach(([driverKey, name]) => {
      const driverNumber = Number(driverKey);
      const driverLabel = name || `#${driverNumber}`;
      const width =
        getLabelWidth(`${MAX_POSITION_LABEL} ${driverLabel}`) + LABEL_LOGO_SIZE + LABEL_LOGO_GAP;
      map.set(driverNumber, width);
    });
    return map;
  }, [driverNames]);

  const driverEntries = useMemo(() => {
    return Object.entries(driverStates)
      .filter(([, state]) => state.position !== null)
      .map(([driverKey, state]) => {
        const driverNumber = Number(driverKey);
        const position = toPoint2D(state.position as NonNullable<typeof state.position>);
        const offset = computeLabelOffset(position, bounds.center);
        const team = driverTeams[driverNumber];
        const driverLabel = driverNames[driverNumber] ?? `#${driverNumber}`;
        const positionLabel =
          state.racePosition === null || state.racePosition === undefined
            ? "-"
            : String(state.racePosition);
        const labelText = `${positionLabel} ${driverLabel}`;
        const labelWidth =
          labelWidthMap.get(driverNumber) ??
          getLabelWidth(`${MAX_POSITION_LABEL} ${driverLabel}`) + LABEL_LOGO_SIZE + LABEL_LOGO_GAP;
        return {
          driverKey,
          driverNumber,
          position,
          labelWidth,
          initialLabelX: position.x + offset.x,
          initialLabelY: position.y + offset.y,
          color: state.color,
          isSelected: selectedDrivers.includes(driverNumber),
          team,
          labelText,
        };
      })
      .sort((a, b) => a.driverNumber - b.driverNumber);
  }, [driverStates, driverTeams, driverNames, bounds.center, selectedDrivers, labelWidthMap]);

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
      const smoothed = smoothLabels(prevLabelsRef.current, message.payload, 0.08);
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
    const smoothFactor = 0.05;

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
      const smoothed = smoothLabels(prevLabelsRef.current, resolved, 0.08);
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
      <TrackBase bounds={bounds} trackSegments={trackSegments} pathD={pathD} />
      {driverEntries.map((entry) => {
        const resolved = labelMap.get(entry.driverKey);
        const labelX = resolved?.x ?? entry.initialLabelX;
        const labelY = resolved?.y ?? entry.initialLabelY;
        const teamLogo = entry.team?.logoUrl;
        const teamInitials = entry.team?.initials ?? "?";
        const logoSize = LABEL_LOGO_SIZE;
        const isHaasTeam = entry.team?.name.toLowerCase().includes("haas") ?? false;
        const logoScale = isHaasTeam ? 1.6 : 1;
        const logoRenderSize = logoSize * logoScale;
        const logoOffset = (logoRenderSize - logoSize) / 2;
        const labelLeft = -entry.labelWidth / 2;
        const logoX = labelLeft + LABEL_PADDING;
        const logoCenterX = logoX + logoSize / 2;
        const logoY = -logoRenderSize / 2;
        const textX = logoX + logoSize + LABEL_LOGO_GAP;
        const clipId = `logo-clip-${entry.driverKey}`;

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
                x={labelLeft}
                y={-LABEL_HEIGHT / 2}
                width={entry.labelWidth}
                height={LABEL_HEIGHT}
                rx="8"
                fill="rgba(0,0,0,0.85)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="0.8"
              />
              <defs>
                <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                  <circle cx={logoCenterX} cy={0} r={logoSize / 2} />
                </clipPath>
              </defs>
              <circle cx={logoCenterX} cy={0} r={logoSize / 2} fill="rgba(255,255,255,0.08)" />
              {teamLogo ? (
                <image
                  href={teamLogo}
                  x={logoX - logoOffset}
                  y={logoY}
                  width={logoRenderSize}
                  height={logoRenderSize}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clipId})`}
                />
              ) : (
                <text
                  textAnchor="middle"
                  x={logoCenterX}
                  dy="4"
                  fill="#FFFFFF"
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
                >
                  {teamInitials}
                </text>
              )}
              <text
                textAnchor="start"
                x={textX}
                dy="4"
                fill="#FFFFFF"
                fontSize="11"
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
