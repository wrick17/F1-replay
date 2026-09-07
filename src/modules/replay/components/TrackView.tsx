import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CircuitSurroundings } from "../types/circuitSurroundings.types";
import type { TrackViewProps } from "../types/replay.types";
import {
  MAP_COLORS,
  mapBounds,
  mapPolygonPath,
  mapScreenBounds2D,
} from "../utils/circuitMapGeometry.util";
import { computeBounds, toPoint2D, VIEWBOX_PADDING } from "../utils/geometry.util";

const TrackBase = memo(({ pathD, pitD }: { pathD: string; pitD: string }) => (
  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={pathD} stroke="#151e2a" strokeWidth="15" />
    <path d={pathD} stroke="#8d9aaa" strokeWidth="5" />
    {pitD && (
      <path data-pit-lane="true" d={pitD} stroke="#38bdf8" strokeWidth="4" strokeDasharray="9 5">
        <title>Pit lane</title>
      </path>
    )}
  </g>
));

const MapBackdrop = memo(
  ({
    surroundings,
    bounds,
  }: {
    surroundings: CircuitSurroundings;
    bounds: ReturnType<typeof mapBounds>;
  }) => {
    const visible = (points: [number, number][]) => {
      const feature = mapBounds(points);
      return (
        feature.maxX * 1000 >= bounds.minX - VIEWBOX_PADDING &&
        feature.minX * 1000 <= bounds.maxX + VIEWBOX_PADDING &&
        feature.maxY * 1000 >= bounds.minY - VIEWBOX_PADDING &&
        feature.minY * 1000 <= bounds.maxY + VIEWBOX_PADDING
      );
    };
    return (
      <g
        pointerEvents="none"
        data-map-buildings={surroundings.buildings.length}
        data-map-features={
          surroundings.buildings.length + surroundings.roads.length + surroundings.areas.length
        }
      >
        <path d={mapPolygonPath(surroundings.coverage)} fill="#192c29" fillRule="evenodd" />
        {surroundings.areas.map((area) =>
          area.polygons
            .filter((polygon) => visible(polygon[0]))
            .map((polygon, index) => (
              <path
                key={`${area.id}-${index}`}
                d={mapPolygonPath(polygon)}
                fill={MAP_COLORS[area.kind]}
                fillOpacity={area.kind === "water" ? 0.75 : 0.35}
                fillRule="evenodd"
              />
            )),
        )}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {surroundings.roads
            .filter((road) => visible(road.points))
            .map((road) => (
              <path
                key={road.id}
                d={road.points
                  .map(
                    (point, i) =>
                      `${i ? "L" : "M"}${(point[0] * 1000).toFixed(2)},${(point[1] * 1000).toFixed(2)}`,
                  )
                  .join(" ")}
                stroke={road.kind === "footway" || road.kind === "path" ? "#526966" : "#60716f"}
                strokeWidth={Math.max(0.8, (road.widthM ?? 5) * surroundings.metersToWorld * 1000)}
                opacity={road.tunnel ? 0.35 : 0.85}
              />
            ))}
        </g>
        {surroundings.buildings.map((building) =>
          building.polygons
            .filter((polygon) => visible(polygon[0]))
            .map((polygon, index) => (
              <path
                key={`${building.id}-${index}`}
                d={mapPolygonPath(polygon)}
                fill="#788a83"
                stroke="#a2b2a8"
                strokeWidth="0.65"
                fillRule="evenodd"
              >
                <title>{building.name ?? "Mapped building"}</title>
              </path>
            )),
        )}
      </g>
    );
  },
);

export const TrackView = ({
  trackPath,
  pitLanePath = [],
  driverStates,
  driverNames,
  driverFullNames,
  driverTeams,
  selectedDrivers,
  className,
  surroundings,
}: TrackViewProps) => {
  const [focusedDriver, setFocusedDriver] = useState<number | null>(null);
  const [hoveredDriver, setHoveredDriver] = useState<number | null>(null);
  const scaledTrack = useMemo(() => trackPath.map(toPoint2D), [trackPath]);
  const scaledPit = useMemo(() => pitLanePath.map(toPoint2D), [pitLanePath]);
  const bounds = useMemo(
    () => computeBounds([...scaledTrack, ...scaledPit]),
    [scaledTrack, scaledPit],
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const [mapVisibleBounds, setMapVisibleBounds] = useState<ReturnType<
    typeof mapScreenBounds2D
  > | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new viewBox needs its screen transform measured after layout.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const next = mapScreenBounds2D(matrix, window.innerWidth, window.innerHeight);
      if (next)
        setMapVisibleBounds((previous) =>
          previous &&
          Object.keys(next).every(
            (key) =>
              Math.abs(next[key as keyof typeof next] - previous[key as keyof typeof next]) < 0.01,
          )
            ? previous
            : next,
        );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    const flat = svg.closest(".replay-flat");
    flat?.addEventListener("transitionend", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      flat?.removeEventListener("transitionend", measure);
    };
  }, [bounds]);
  const pitD = useMemo(
    () =>
      scaledPit
        .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(" "),
    [scaledPit],
  );
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
    ? `P${active.state.racePosition ?? "–"} ${active.fullName} · ${driverTeams[active.driverNumber]?.name ?? ""}${active.state.locationStatus === "stale" ? " · Last known location" : ""}`
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
      ref={svgRef}
      style={{ overflow: "visible" }}
      className={className}
      viewBox={`${bounds.minX - VIEWBOX_PADDING} ${bounds.minY - VIEWBOX_PADDING} ${Math.max(bounds.width, 1) + VIEWBOX_PADDING * 2} ${Math.max(bounds.height, 1) + VIEWBOX_PADDING * 2}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label="F1 circuit and driver positions"
      role="group"
    >
      <title>F1 circuit and driver positions</title>
      <desc>Focus a driver marker to show the full driver name, position, and team.</desc>
      {surroundings && (
        <MapBackdrop surroundings={surroundings} bounds={mapVisibleBounds ?? bounds} />
      )}
      <TrackBase pathD={pathD} pitD={pitD} />
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
          aria-label={`Position ${entry.state.racePosition ?? "unknown"}, ${entry.fullName}, ${driverTeams[entry.driverNumber]?.name ?? ""}${entry.state.locationStatus === "stale" ? ", last known location" : ""}`}
          onFocus={() => setFocusedDriver(entry.driverNumber)}
          onBlur={() => setFocusedDriver(null)}
          onMouseEnter={() => setHoveredDriver(entry.driverNumber)}
          onMouseLeave={() => setHoveredDriver(null)}
          style={{ outline: "none" }}
        >
          <title>{`${entry.fullName}${entry.state.locationStatus === "stale" ? " · Last known location" : ""}`}</title>
          <circle
            r={entry.selected || entry.driverNumber === focusedDriver ? 9 : 7}
            fill={entry.state.color}
            stroke={entry.driverNumber === activeDriver ? "#fff" : "#0c111a"}
            strokeWidth="2"
            strokeDasharray={entry.state.locationStatus === "stale" ? "3 2" : undefined}
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
