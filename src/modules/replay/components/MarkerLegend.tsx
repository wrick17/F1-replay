import { AlertTriangle, ArrowRightLeft, CircleDot, Flag, Radio, ShieldAlert } from "lucide-react";

const LEGEND_ITEMS = [
  { type: "radio", color: "#3b82f6", label: "Team Radio", icon: Radio },
  { type: "overtake", color: "#22c55e", label: "Overtake", icon: ArrowRightLeft },
  { type: "flag", color: "#eab308", label: "Flag", icon: Flag },
  { type: "safety-car", color: "#ef4444", label: "Safety Car", icon: ShieldAlert },
  { type: "pit", color: "#6b7280", label: "Pit Stop", icon: CircleDot },
  { type: "race-control", color: "#a855f7", label: "Race Control", icon: AlertTriangle },
] as const;

type MarkerLegendProps = {
  hasEvents: boolean;
};

export const MarkerLegend = ({ hasEvents }: MarkerLegendProps) => {
  if (!hasEvents) return null;

  return (
    <div className="flex w-fit flex-col gap-1 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/70 backdrop-blur-xl">
      {LEGEND_ITEMS.map((item) => (
        <span key={item.type} className="inline-flex items-center gap-2">
          <item.icon size={14} style={{ color: item.color }} />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
};
