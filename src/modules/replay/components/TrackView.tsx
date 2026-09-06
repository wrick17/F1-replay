import { memo, useMemo, useState } from "react";
import type { TrackViewProps } from "../types/replay.types";
import { computeBounds, toPoint2D, VIEWBOX_PADDING } from "../utils/geometry.util";

const TrackBase = memo(({ pathD }: { pathD: string }) => (
  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={pathD} stroke="#151e2a" strokeWidth="15" />
    <path d={pathD} stroke="#8d9aaa" strokeWidth="5" />
  </g>
));

export const TrackView = ({
  trackPath,
  driverStates,
  driverNames,
  driverFullNames,
  driverTeams,
  selectedDrivers,
  className,
}: TrackViewProps) => {
  const [focusedDriver, setFocusedDriver] = useState<number | null>(null);
  const [hoveredDriver, setHoveredDriver] = useState<number | null>(null);
  const scaledTrack = useMemo(() => trackPath.map(toPoint2D), [trackPath]);
  const bounds = useMemo(() => computeBounds(scaledTrack), [scaledTrack]);
  const pathD = useMemo(() => {
    let penDown = false;
    return scaledTrack
      .map((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          penDown = false;
          return "";
        }
        const command = penDown ? "L" : "M";
        penDown = true;
        return `${command}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(" ");
  }, [scaledTrack]);
  const activeDriver = focusedDriver ?? hoveredDriver ?? selectedDrivers[0];
  const entries = Object.entries(driverStates)
    .filter(
      ([, state]) =>
        state.position && Number.isFinite(state.position.x) && Number.isFinite(state.position.y),
    )
    .map(([key, state]) => {
      const driverNumber = Number(key);
      return {
        driverNumber,
        state,
        point: toPoint2D(state.position ?? { x: 0, y: 0, z: 0 }),
        name: driverNames[driverNumber] ?? `#${driverNumber}`,
        fullName:
          driverFullNames?.[driverNumber] ?? driverNames[driverNumber] ?? `Driver ${driverNumber}`,
        selected: selectedDrivers.includes(driverNumber),
      };
    })
    .sort(
      (a, b) =>
        Number(a.driverNumber === activeDriver) - Number(b.driverNumber === activeDriver) ||
        a.driverNumber - b.driverNumber,
    );
  const active = entries.find((entry) => entry.driverNumber === activeDriver);
  const labelText = active
    ? `P${active.state.racePosition ?? "–"} ${active.fullName} · ${driverTeams[active.driverNumber]?.name ?? ""}`
    : "";
  const labelWidth = Math.min(
    Math.max(labelText.length * 6.5 + 24, 110),
    Math.max(bounds.width, 200),
  );
  const labelX = active
    ? Math.max(
        bounds.minX - VIEWBOX_PADDING + labelWidth / 2 + 8,
        Math.min(bounds.maxX + VIEWBOX_PADDING - labelWidth / 2 - 8, active.point.x),
      )
    : 0;
  const labelY = active ? Math.max(bounds.minY - VIEWBOX_PADDING + 20, active.point.y - 43) : 0;

  const visibleLabels = new Set<number>();
  const occupied = active
    ? [{ x: labelX - labelWidth / 2, y: labelY - 14, width: labelWidth, height: 28 }]
    : [];
  // ponytail: at most 20 cars; hide crowded captions and keep every dot focusable instead of moving labels.
  for (const entry of [...entries].sort(
    (a, b) =>
      Number(b.driverNumber === activeDriver) - Number(a.driverNumber === activeDriver) ||
      Number(b.selected) - Number(a.selected) ||
      (a.state.racePosition ?? 99) - (b.state.racePosition ?? 99),
  )) {
    const box = { x: entry.point.x + 9, y: entry.point.y - 10, width: 49, height: 20 };
    if (
      occupied.some(
        (other) =>
          box.x < other.x + other.width + 3 &&
          box.x + box.width + 3 > other.x &&
          box.y < other.y + other.height + 3 &&
          box.y + box.height + 3 > other.y,
      )
    )
      continue;
    occupied.push(box);
    visibleLabels.add(entry.driverNumber);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: SVG group preserves interactive driver markers in the accessibility tree
    <svg
      className={className}
      viewBox={`${bounds.minX - VIEWBOX_PADDING} ${bounds.minY - VIEWBOX_PADDING} ${Math.max(bounds.width, 1) + VIEWBOX_PADDING * 2} ${Math.max(bounds.height, 1) + VIEWBOX_PADDING * 2}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label="F1 circuit and driver positions"
      role="group"
    >
      <title>F1 circuit and driver positions</title>
      <desc>Focus a driver marker to show the full driver name, position, and team.</desc>
      <TrackBase pathD={pathD} />
      {entries.map((entry) => (
        // biome-ignore lint/a11y/useSemanticElements: SVG has no native button; keyboard activation and focus are provided
        <g
          key={entry.driverNumber}
          transform={`translate(${entry.point.x}, ${entry.point.y})`}
          tabIndex={0}
          role="button"
          onClick={() => setFocusedDriver(entry.driverNumber)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setFocusedDriver(entry.driverNumber);
            }
          }}
          aria-label={`Position ${entry.state.racePosition ?? "unknown"}, ${entry.fullName}, ${driverTeams[entry.driverNumber]?.name ?? ""}`}
          onFocus={() => setFocusedDriver(entry.driverNumber)}
          onBlur={() => setFocusedDriver(null)}
          onMouseEnter={() => setHoveredDriver(entry.driverNumber)}
          onMouseLeave={() => setHoveredDriver(null)}
          style={{ outline: "none" }}
        >
          <title>{entry.fullName}</title>
          <circle
            r={entry.selected || entry.driverNumber === focusedDriver ? 9 : 6}
            fill={entry.state.color}
            stroke={entry.driverNumber === activeDriver ? "#fff" : "#0c111a"}
            strokeWidth="2"
          />
          {visibleLabels.has(entry.driverNumber) && (
            <g data-track-caption={entry.driverNumber}>
              <rect
                x="9"
                y="-10"
                width="49"
                height="20"
                rx="4"
                fill="#101722"
                fillOpacity="0.92"
                stroke={
                  entry.selected || entry.driverNumber === activeDriver
                    ? entry.state.color
                    : "#344052"
                }
              />
              <text
                x="33.5"
                y="3.5"
                fill="#f8fafc"
                fontSize="10"
                fontWeight="650"
                textAnchor="middle"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                pointerEvents="none"
              >
                {entry.state.racePosition ?? "–"} {entry.name.slice(0, 3)}
              </text>
            </g>
          )}
        </g>
      ))}
      {active && (
        <g pointerEvents="none" data-track-detail={active.driverNumber}>
          <line
            x1={active.point.x}
            y1={active.point.y - 9}
            x2={labelX}
            y2={labelY + 14}
            stroke={active.state.color}
            strokeWidth="1.5"
          />
          <rect
            x={labelX - labelWidth / 2}
            y={labelY - 14}
            width={labelWidth}
            height="28"
            rx="6"
            fill="#080d15"
            stroke={active.state.color}
            strokeWidth="1.5"
          />
          <text
            x={labelX}
            y={labelY + 4}
            fill="#fff"
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {labelText}
          </text>
        </g>
      )}
    </svg>
  );
};
