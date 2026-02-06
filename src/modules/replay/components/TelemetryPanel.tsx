type TelemetrySummary = {
  sessionLabel: string;
  coverageLabel: string;
  totalDrivers: number;
};

type TelemetryRow = {
  driverNumber: number;
  driverName: string;
  driverAcronym: string;
  position: number | null;
  lap: number | null;
  compound: string | null;
};

type TelemetryPanelProps = {
  summary: TelemetrySummary;
  rows: TelemetryRow[];
};

const normalizeCompound = (compound: string | null) => {
  if (!compound) {
    return null;
  }
  return compound.trim().toUpperCase();
};

const getCompoundBadge = (compound: string | null) => {
  const upper = normalizeCompound(compound);
  if (!upper) {
    return "-";
  }
  if (upper.startsWith("HARD")) return "H";
  if (upper.startsWith("MED")) return "M";
  if (upper.startsWith("SOF")) return "S";
  if (upper.startsWith("INT")) return "I";
  if (upper.startsWith("WET")) return "W";
  return upper.charAt(0) || "-";
};

const getCompoundLabel = (compound: string | null) => {
  const upper = normalizeCompound(compound);
  if (!upper) {
    return "Unknown";
  }
  if (upper.startsWith("HARD")) return "Hard";
  if (upper.startsWith("MED")) return "Medium";
  if (upper.startsWith("SOF")) return "Soft";
  if (upper.startsWith("INT")) return "Intermediate";
  if (upper.startsWith("WET")) return "Wet";
  return compound ?? "Unknown";
};

export const TelemetryPanel = ({ summary, rows }: TelemetryPanelProps) => {
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
          {rows.map((row) => (
            <div
              key={row.driverNumber}
              className="grid grid-cols-[0.45fr_2fr_0.55fr_0.55fr] items-center gap-1 rounded-lg bg-white/5 px-2 py-2"
            >
              <div className="text-center text-white/80">
                {row.position ?? "-"}
              </div>
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
