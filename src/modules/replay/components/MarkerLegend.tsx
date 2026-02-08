import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Flag,
  Radio,
  ShieldAlert,
} from "lucide-react";
import type { MarkerLegendProps } from "../types/replay.types";

const LEGEND_ITEMS = [
  { type: "radio", color: "#3b82f6", label: "Team Radio", icon: Radio },
  { type: "overtake", color: "#22c55e", label: "Overtake", icon: ArrowRightLeft },
  { type: "flag", color: "#eab308", label: "Flag", icon: Flag },
  { type: "safety-car", color: "#ef4444", label: "Safety Car", icon: ShieldAlert },
  { type: "pit", color: "#6b7280", label: "Pit Stop", icon: CircleDot },
  { type: "race-control", color: "#a855f7", label: "Race Control", icon: AlertTriangle },
] as const;

const SHORTCUT_ITEMS = [
  { key: "Space", description: "Play / Pause" },
  { key: "← / →", description: "Skip back / forward" },
  { key: "S", description: "Cycle speed" },
  { key: "M", description: "Toggle radio" },
  { key: "I", description: "Cycle skip interval" },
  { key: "E", description: "Expand timeline" },
] as const;

export const MarkerLegend = ({
  hasEvents,
  legendCollapsed,
  onToggleLegendCollapsed,
  shortcutsCollapsed,
  onToggleShortcutsCollapsed,
}: MarkerLegendProps) => {
  return (
    <div className="flex w-fit flex-row gap-0 rounded-xl border border-white/20 bg-white/5 text-xs text-white/70 backdrop-blur-xl md:flex-col">
      {/* Legend section */}
      {hasEvents && (
        <div>
          <button
            type="button"
            onClick={onToggleLegendCollapsed}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-white/50 transition hover:text-white/70"
          >
            {legendCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span className="text-[10px] font-semibold uppercase tracking-wider">Legend</span>
          </button>
          {!legendCollapsed && (
            <div className="flex flex-col gap-1 px-3 pb-2">
              {LEGEND_ITEMS.map((item) => (
                <span key={item.type} className="inline-flex items-center gap-2">
                  <item.icon size={14} style={{ color: item.color }} />
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shortcuts section */}
      <div className={hasEvents ? "border-l border-white/10 md:border-l-0 md:border-t" : ""}>
        <button
          type="button"
          onClick={onToggleShortcutsCollapsed}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-white/50 transition hover:text-white/70"
        >
          {shortcutsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-[10px] font-semibold uppercase tracking-wider">Shortcuts</span>
        </button>
        {!shortcutsCollapsed && (
          <div className="flex flex-col gap-1 px-3 pb-2">
            {SHORTCUT_ITEMS.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-2">
                <kbd className="inline-block min-w-[28px] rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-center font-mono text-[10px] text-white/60">
                  {item.key}
                </kbd>
                <span>{item.description}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
