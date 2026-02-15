import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useMemo, useState } from "react";
import { useCarTelemetryData } from "../hooks/useCarTelemetryData";
import {
  clamp,
  computeSessionStats,
  findNearestSample,
  formatGear,
  formatInt,
  getBarColorClass,
  isDrsOn,
  isSpeedDanger,
  normalizeBrakePercent,
  normalizeDrsPercent,
} from "../services/carTelemetry.service";
import type { TelemetryPanelProps, TelemetryRow } from "../types/replay.types";
import { getCompoundBadge, getCompoundLabel } from "../utils/format.util";
import { Tooltip } from "./Tooltip";

type OvertakeRole = "overtaking" | "overtaken" | null;

const formatLapDuration = (lapDurationSeconds: number | null | undefined) => {
  if (
    lapDurationSeconds === null ||
    lapDurationSeconds === undefined ||
    !Number.isFinite(lapDurationSeconds)
  ) {
    return "--";
  }
  const totalMs = Math.round(lapDurationSeconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

const overtakeStyles: Record<string, string> = {
  overtaking: "ring-2 ring-inset ring-green-400/70 bg-green-500/10",
  overtaken: "ring-2 ring-inset ring-red-400/70 bg-red-500/10",
};

const SKELETON_ROWS = Array.from({ length: 8 }, (_, index) => `skeleton-${index + 1}`);

type TelemetryRowProps = {
  row: TelemetryRow;
  overtakeRole: OvertakeRole;
  telemetryEnabled: boolean;
  telemetryView: DriverTelemetryView | null;
};

type TwoRowValue = {
  label: string;
  value: string;
  percent: number;
  barClass: string;
  danger?: boolean;
};

type OneRowValue = {
  label: string;
  value: string;
};

type DriverTelemetryView = {
  speed: TwoRowValue;
  gear: OneRowValue;
  rpm: TwoRowValue;
  throttle: TwoRowValue;
  brake: TwoRowValue;
  drs: TwoRowValue;
};

const TwoRowPill = ({ item }: { item: TwoRowValue }) => {
  return (
    <div
      className={`rounded-md border px-2 py-1 ${
        item.danger ? "border-red-500/40 bg-red-500/10" : "border-white/15 bg-white/5"
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 font-semibold text-white/70">
        <span className="text-[9px] uppercase tracking-wide whitespace-nowrap text-white/40">
          {item.label}
        </span>
        <span
          className={`text-[10px] whitespace-nowrap tabular-nums ${
            item.danger ? "text-red-200" : "text-white/70"
          }`}
        >
          {item.value}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-white/10">
        <div
          className={`h-full ${item.barClass} motion-reduce:transition-none transition-[width,background-color] duration-300 ease-out will-change-[width]`}
          style={{ width: `${clamp(item.percent, 0, 100)}%` }}
        />
      </div>
    </div>
  );
};

const OneRowPill = ({ item }: { item: OneRowValue }) => {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-white/15 bg-white/5 px-2 py-1 font-semibold text-white/70">
      <span className="text-[9px] uppercase tracking-wide whitespace-nowrap text-white/40">
        {item.label}
      </span>
      <span className="text-[10px] whitespace-nowrap tabular-nums text-white/70">{item.value}</span>
    </div>
  );
};

const TelemetryRowItem = memo(
  ({ row, overtakeRole, telemetryEnabled, telemetryView }: TelemetryRowProps) => {
    const overtakeClass = overtakeRole ? overtakeStyles[overtakeRole] : "";
    const lapDurationLabel = formatLapDuration(row.lapDurationSeconds);
    const compoundLabel = getCompoundLabel(row.compound);
    const lapCompoundLabel = row.lap ? `L${row.lap} · ${compoundLabel}` : `L-- · ${compoundLabel}`;
    const isHaasTeam = row.teamName.toLowerCase().includes("haas");
    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{
          layout: { type: "spring", stiffness: 400, damping: 30, mass: 0.8 },
          opacity: { duration: 0.2 },
          scale: { duration: 0.2 },
        }}
        className={`rounded-lg bg-white/5 px-2 py-2 transition-shadow duration-500 ${overtakeClass}`}
      >
        <div className="grid grid-cols-[auto_1fr] items-start gap-2">
          {/* Top section: always visible (driver/team info). */}
          <div className="grid grid-rows-[28px_24px] items-center justify-items-center gap-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold text-white/70">
              {row.headshotUrl ? (
                <img
                  src={row.headshotUrl}
                  alt={`${row.driverName} headshot`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span>{row.driverAcronym || row.driverNumber}</span>
              )}
            </div>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/5 text-[9px] font-semibold text-white/60">
              {row.teamLogoUrl ? (
                <img
                  src={row.teamLogoUrl}
                  alt={`${row.teamName} logo`}
                  className={`h-full w-full rounded-full object-cover ${isHaasTeam ? "scale-[1.6]" : ""}`}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span>{row.teamInitials || row.teamName.charAt(0)}</span>
              )}
            </div>
          </div>

          <div className="grid min-w-0 grid-rows-[28px_24px] gap-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 truncate text-white">{row.driverName}</span>
              <div className="flex items-center gap-2 text-[10px] text-white/70">
                <span className="rounded-full border border-white/20 px-2 py-0.5 font-semibold uppercase text-white/70">
                  P{row.position ?? "-"}
                </span>
                <Tooltip content={`${lapCompoundLabel} · ${lapDurationLabel}`}>
                  <span className="rounded-full border border-white/20 px-2 py-0.5 font-semibold uppercase text-white/70">
                    {row.lap ?? "--"} · {getCompoundBadge(row.compound)}
                  </span>
                </Tooltip>
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] text-white/40">
              <Tooltip content={row.teamName}>
                <span className="min-w-0 truncate">{row.teamName}</span>
              </Tooltip>
              <span className="shrink-0">
                #{row.driverNumber}
                {row.driverAcronym ? ` · ${row.driverAcronym}` : ""}
              </span>
            </div>
          </div>

          {/* Bottom section: toggled (telemetry pills), aligned with the text column. */}
          {telemetryEnabled && telemetryView && (
            <div className="col-span-2 mt-2 grid grid-cols-2 gap-1.5">
              <TwoRowPill item={telemetryView.speed} />
              <OneRowPill item={telemetryView.gear} />
              <TwoRowPill item={telemetryView.rpm} />
              <TwoRowPill item={telemetryView.throttle} />
              <TwoRowPill item={telemetryView.brake} />
              <TwoRowPill item={telemetryView.drs} />
            </div>
          )}
        </div>
      </motion.div>
    );
  },
  (prev, next) =>
    prev.overtakeRole === next.overtakeRole &&
    prev.row.driverNumber === next.row.driverNumber &&
    prev.row.driverName === next.row.driverName &&
    prev.row.driverAcronym === next.row.driverAcronym &&
    prev.row.headshotUrl === next.row.headshotUrl &&
    prev.row.teamName === next.row.teamName &&
    prev.row.teamLogoUrl === next.row.teamLogoUrl &&
    prev.row.teamInitials === next.row.teamInitials &&
    prev.row.lapDurationSeconds === next.row.lapDurationSeconds &&
    prev.row.position === next.row.position &&
    prev.row.lap === next.row.lap &&
    prev.row.compound === next.row.compound &&
    prev.row.isPitOutLap === next.row.isPitOutLap &&
    prev.telemetryEnabled === next.telemetryEnabled &&
    prev.telemetryView?.speed.value === next.telemetryView?.speed.value &&
    prev.telemetryView?.speed.percent === next.telemetryView?.speed.percent &&
    prev.telemetryView?.speed.danger === next.telemetryView?.speed.danger &&
    prev.telemetryView?.gear.value === next.telemetryView?.gear.value &&
    prev.telemetryView?.rpm.value === next.telemetryView?.rpm.value &&
    prev.telemetryView?.rpm.percent === next.telemetryView?.rpm.percent &&
    prev.telemetryView?.throttle.value === next.telemetryView?.throttle.value &&
    prev.telemetryView?.throttle.percent === next.telemetryView?.throttle.percent &&
    prev.telemetryView?.brake.value === next.telemetryView?.brake.value &&
    prev.telemetryView?.brake.percent === next.telemetryView?.brake.percent &&
    prev.telemetryView?.drs.value === next.telemetryView?.drs.value &&
    prev.telemetryView?.drs.percent === next.telemetryView?.drs.percent,
);

export const TelemetryPanel = ({
  summary,
  rows,
  activeOvertakes = [],
  isLoading = false,
  currentTimeMs = 0,
  sessionKey = null,
  sessionStartMs = 0,
  sessionEndMs = 0,
}: TelemetryPanelProps) => {
  const showSkeleton = isLoading && rows.length === 0;
  const overtakeRoleMap = useMemo(() => {
    const map = new Map<number, OvertakeRole>();
    for (const ot of activeOvertakes) {
      map.set(ot.overtaking_driver_number, "overtaking");
      map.set(ot.overtaken_driver_number, "overtaken");
    }
    return map;
  }, [activeOvertakes]);

  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("f1.telemetry.enabled");
      setTelemetryEnabled(stored === "true");
    } catch {
      setTelemetryEnabled(false);
    }
  }, []);

  const handleToggleTelemetry = () => {
    setTelemetryEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("f1.telemetry.enabled", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const telemetry = useCarTelemetryData({
    enabled: telemetryEnabled && !isLoading,
    sessionKey,
    sessionStartMs,
    sessionEndMs,
  });

  const stats = useMemo(() => {
    return telemetry.payload ? computeSessionStats(telemetry.payload) : null;
  }, [telemetry.payload]);

  const telemetryViewByDriver = useMemo(() => {
    if (!telemetryEnabled) {
      return new Map<number, DriverTelemetryView>();
    }

    const map = new Map<number, DriverTelemetryView>();
    const speedMaxSession = stats?.speedMaxSession ?? 300;
    const rpmMaxSession = stats?.rpmMaxSession ?? 12000;

    for (const row of rows) {
      const samples = telemetry.payload?.byDriver[row.driverNumber] ?? [];
      const nearest = samples.length ? findNearestSample(samples, currentTimeMs) : null;

      const speed = nearest?.speed ?? null;
      const gear = nearest?.gear ?? null;
      const rpm = nearest?.rpm ?? null;
      const throttle = nearest?.throttle ?? null;
      const rawBrake = nearest?.brake ?? null;
      const rawDrs = nearest?.drs ?? null;

      const speedPercent =
        speed === null ? 0 : clamp((speed / Math.max(1, speedMaxSession)) * 100, 0, 100);
      const rpmPercent = rpm === null ? 0 : clamp((rpm / Math.max(1, rpmMaxSession)) * 100, 0, 100);
      const throttlePercent = throttle === null ? 0 : clamp(throttle, 0, 100);
      const brakePercent = rawBrake === null ? 0 : normalizeBrakePercent(rawBrake);
      const drsPercent = rawDrs === null ? 0 : normalizeDrsPercent(rawDrs);

      const speedDanger = speed !== null && isSpeedDanger(speed);
      const brakeOn = rawBrake !== null && normalizeBrakePercent(rawBrake) > 0;
      const drsOn = rawDrs !== null && isDrsOn(rawDrs);

      map.set(row.driverNumber, {
        speed: {
          label: "Speed",
          value: speed === null ? "--" : `${formatInt(speed)} km/h`,
          percent: speedPercent,
          barClass: getBarColorClass(speedPercent),
          danger: speedDanger,
        },
        gear: {
          label: "Gear",
          value: gear === null ? "--" : formatGear(gear),
        },
        rpm: {
          label: "RPM",
          value: rpm === null ? "--" : formatInt(rpm),
          percent: rpmPercent,
          barClass: getBarColorClass(rpmPercent),
        },
        throttle: {
          label: "Throttle",
          value: throttle === null ? "--" : `${formatInt(throttlePercent)}%`,
          percent: throttlePercent,
          barClass: getBarColorClass(throttlePercent),
        },
        brake: {
          label: "Brake",
          value: rawBrake === null ? "--" : brakeOn ? "ON" : "OFF",
          percent: brakePercent,
          barClass: getBarColorClass(brakePercent),
        },
        drs: {
          label: "DRS",
          value: rawDrs === null ? "--" : drsOn ? "ON" : "OFF",
          percent: drsPercent,
          barClass: getBarColorClass(drsPercent),
        },
      });
    }

    return map;
  }, [telemetryEnabled, telemetry.payload, currentTimeMs, rows, stats]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-xl border border-white/20 bg-white/5 p-4 backdrop-blur-xl">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">Leaderboard</div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-wide text-white/60">TELEMETRY</span>
            <button
              type="button"
              role="switch"
              aria-checked={telemetryEnabled}
              onClick={handleToggleTelemetry}
              className={`relative h-5 w-9 rounded-full border transition ${
                telemetryEnabled ? "border-red-500/50 bg-red-500/30" : "border-white/20 bg-white/10"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white/80 transition ${
                  telemetryEnabled ? "left-4" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>
        {telemetryEnabled && telemetry.error && (
          <div className="mt-1 text-[10px] text-red-200/80">Telemetry error: {telemetry.error}</div>
        )}
        {telemetryEnabled && !telemetry.error && telemetry.loading && (
          <div className="mt-1 text-[10px] text-white/50">Loading telemetry…</div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-white/70">
        <div>
          <div className="text-[10px] uppercase text-white/40">Coverage</div>
          <div className="text-white/80">
            {showSkeleton ? (
              <span className="block h-3 w-16 rounded bg-white/10 animate-pulse" />
            ) : (
              summary.coverageLabel
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-white/40">Drivers</div>
          <div className="text-white/80">
            {showSkeleton ? (
              <span className="block h-3 w-10 rounded bg-white/10 animate-pulse" />
            ) : (
              summary.totalDrivers
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-[10px] uppercase text-white/40">
          <span className="text-center">Driver</span>
          <div className="flex items-center justify-between">
            <span>Driver</span>
            <span>Pos/Lap</span>
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <AnimatePresence initial={false} mode="popLayout">
            {showSkeleton
              ? SKELETON_ROWS.map((key) => (
                  <div
                    key={key}
                    className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg bg-white/5 px-2 py-2"
                  >
                    <div className="grid grid-rows-[28px_24px] items-center justify-items-center gap-1">
                      <div className="h-7 w-7 rounded-full bg-white/10 animate-pulse" />
                      <div className="h-6 w-6 rounded-full bg-white/10 animate-pulse" />
                    </div>
                    <div className="grid min-w-0 grid-rows-[28px_24px] gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
                        <div className="h-4 w-20 rounded-full bg-white/10 animate-pulse" />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-2 w-20 rounded bg-white/10 animate-pulse" />
                        <div className="h-2 w-12 rounded bg-white/10 animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))
              : rows.map((row) => (
                  <TelemetryRowItem
                    key={row.driverNumber}
                    row={row}
                    overtakeRole={overtakeRoleMap.get(row.driverNumber) ?? null}
                    telemetryEnabled={telemetryEnabled}
                    telemetryView={telemetryViewByDriver.get(row.driverNumber) ?? null}
                  />
                ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
