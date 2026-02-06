import { AnimatePresence, motion } from "framer-motion";
import type { TelemetryPanelProps } from "../types/replay.types";
import { getCompoundBadge, getCompoundLabel } from "../utils/format.util";

const getOvertakeStyle = (
  driverNumber: number,
  activeOvertake: TelemetryPanelProps["activeOvertake"],
): string => {
  if (!activeOvertake) return "";
  if (driverNumber === activeOvertake.overtaking_driver_number) {
    return "ring-2 ring-green-400/70 bg-green-500/10";
  }
  if (driverNumber === activeOvertake.overtaken_driver_number) {
    return "ring-2 ring-red-400/70 bg-red-500/10";
  }
  return "";
};

export const TelemetryPanel = ({ summary, rows, activeOvertake }: TelemetryPanelProps) => {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-white/20 bg-white/5 p-4 backdrop-blur-xl">
      <div>
        <div className="text-sm font-semibold text-white">Telemetry</div>
        <div className="text-xs text-white/60">{summary.sessionLabel}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-white/70">
        <div>
          <div className="text-[10px] uppercase text-white/40">Coverage</div>
          <div className="text-white/80">{summary.coverageLabel}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-white/40">Drivers</div>
          <div className="text-white/80">{summary.totalDrivers}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-[0.45fr_2fr_0.55fr_0.55fr] gap-1 text-[10px] uppercase text-white/40">
          <span className="text-center">Pos</span>
          <span>Driver</span>
          <span className="text-center">Lap</span>
          <span className="text-center">Tyre</span>
        </div>
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <AnimatePresence mode="popLayout">
            {rows.map((row) => {
              const overtakeClass = getOvertakeStyle(row.driverNumber, activeOvertake);
              return (
                <motion.div
                  key={row.driverNumber}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
                  className={`grid grid-cols-[0.45fr_2fr_0.55fr_0.55fr] items-center gap-1 rounded-lg bg-white/5 px-2 py-2 transition-shadow duration-500 ${overtakeClass}`}
                >
                  <div className="text-center text-white/80">{row.position ?? "-"}</div>
                  <div className="min-w-0">
                    <div className="truncate text-white">{row.driverName}</div>
                    <div className="text-[10px] text-white/40">
                      #{row.driverNumber}
                      {row.driverAcronym ? ` · ${row.driverAcronym}` : ""}
                    </div>
                  </div>
                  <div className="text-center text-white/80">{row.lap ?? "-"}</div>
                  <div className="flex justify-center">
                    <span
                      className="rounded-full border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/70"
                      title={getCompoundLabel(row.compound)}
                    >
                      {getCompoundBadge(row.compound)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
