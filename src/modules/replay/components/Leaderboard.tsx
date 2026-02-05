type LeaderboardEntry = {
  driverNumber: number;
  name: string;
  teamColor: string;
  position: number | null;
  compound: string | null;
  isSelected: boolean;
};

type LeaderboardProps = {
  entries: LeaderboardEntry[];
  onToggleSelect: (driverNumber: number) => void;
};

const getCompoundBadge = (compound: string | null) => {
  if (!compound) {
    return "-";
  }
  const upper = compound.toUpperCase();
  if (upper.startsWith("H")) return "H";
  if (upper.startsWith("M")) return "M";
  if (upper.startsWith("S")) return "S";
  return upper.charAt(0) || "-";
};

export const Leaderboard = ({ entries, onToggleSelect }: LeaderboardProps) => {
  return (
    <div className="flex h-full flex-col gap-2 rounded-xl border border-white/20 bg-white/5 p-4 backdrop-blur-xl">
      <div className="text-sm font-semibold text-white">Leaderboard</div>
      <div className="flex flex-col gap-2 overflow-y-auto pr-2 text-xs">
        {entries.map((entry) => (
          <button
            key={entry.driverNumber}
            type="button"
            onClick={() => onToggleSelect(entry.driverNumber)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
              entry.isSelected ? "bg-[#E10600]/20" : "bg-white/10"
            }`}
          >
            <span className="w-6 text-white/70">{entry.position ?? "-"}</span>
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: `#${entry.teamColor}` }}
            />
            <span className="flex-1 text-white">{entry.name}</span>
            <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/70">
              {getCompoundBadge(entry.compound)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
