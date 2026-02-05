import type { OpenF1Meeting, OpenF1Session } from "../types/openf1.types";
import type { SessionType } from "../hooks/useReplayData";

type SessionPickerProps = {
  year: number;
  round: number;
  sessionType: SessionType;
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
  onYearChange: (year: number) => void;
  onRoundChange: (round: number) => void;
  onSessionTypeChange: (sessionType: SessionType) => void;
};

const SESSION_TYPES: SessionType[] = ["Race", "Sprint", "Qualifying"];

const buildYearOptions = (currentYear: number) => {
  const years: number[] = [];
  for (let year = currentYear; year >= currentYear - 5; year -= 1) {
    years.push(year);
  }
  return years;
};

export const SessionPicker = ({
  year,
  round,
  sessionType,
  meetings,
  sessions,
  onYearChange,
  onRoundChange,
  onSessionTypeChange,
}: SessionPickerProps) => {
  const yearOptions = buildYearOptions(new Date().getFullYear());
  const rounds = meetings.map((meeting, index) => ({
    round: index + 1,
    label: meeting.meeting_name,
  }));
  const availableTypes = sessions.map((session) => session.session_type);
  const hasSessionType = availableTypes.includes(sessionType);

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/60">Year</span>
        <select
          id="replay-year"
          name="replay-year"
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
          className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/70"
        >
          {yearOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/60">Round</span>
        <select
          id="replay-round"
          name="replay-round"
          value={round}
          onChange={(event) => onRoundChange(Number(event.target.value))}
          className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/70"
        >
          {rounds.map((option) => (
            <option key={option.round} value={option.round}>
              {option.round}. {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/60">Session</span>
        <select
          id="replay-session"
          name="replay-session"
          value={sessionType}
          onChange={(event) =>
            onSessionTypeChange(event.target.value as SessionType)
          }
          className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/70"
        >
          {SESSION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      {!hasSessionType && (
        <div className="text-[11px] text-amber-300">
          Session not available for this round.
        </div>
      )}
    </div>
  );
};
