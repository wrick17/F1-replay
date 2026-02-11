import type { NormalizedPosition } from "../utils/telemetry.util";
import type {
  OpenF1Driver,
  OpenF1Meeting,
  OpenF1Overtake,
  OpenF1Session,
  OpenF1TeamRadio,
  TimedSample,
} from "./openf1.types";

export type SessionType = "Race" | "Sprint" | "Qualifying";

export type DriverRenderState = {
  position: NormalizedPosition | null;
  color: string;
  racePosition?: number | null;
};

export type TelemetrySummary = {
  sessionLabel: string;
  coverageLabel: string;
  totalDrivers: number;
};

export type TelemetryRow = {
  driverNumber: number;
  driverName: string;
  driverAcronym: string;
  headshotUrl: string | null;
  teamName: string;
  teamLogoUrl: string | null;
  teamInitials: string;
  lapDurationSeconds: number | null;
  isPitOutLap: boolean | null;
  position: number | null;
  lap: number | null;
  compound: string | null;
};

export type TimelineEventType =
  | "radio"
  | "overtake"
  | "flag"
  | "safety-car"
  | "pit"
  | "race-control";

export type TimelineEvent = {
  timestampMs: number;
  type: TimelineEventType;
  color: string;
  label: string;
  detail: string;
  driverNumbers?: number[];
  data: unknown;
};

export type TrackViewProps = {
  trackPath: NormalizedPosition[];
  driverStates: Record<number, DriverRenderState>;
  driverNames: Record<number, string>;
  driverTeams: Record<number, TeamBranding>;
  selectedDrivers: number[];
  className?: string;
};

export type TeamBranding = {
  name: string;
  logoUrl: string | null;
  initials: string;
};

export type ControlsBarProps = {
  isPlaying: boolean;
  isBuffering: boolean;
  speed: number;
  currentTimeMs: number;
  startTimeMs: number;
  endTimeMs: number;
  canPlay: boolean;
  timelineEvents: TimelineEvent[];
  radioEnabled: boolean;
  drivers: OpenF1Driver[];
  isRadioPlaying: boolean;
  skipIntervalLabel: string;
  expanded: boolean;
  onTogglePlay: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onCycleSpeed: () => void;
  onCycleSkipInterval: () => void;
  onToggleExpanded: () => void;
  onSeek: (timestampMs: number) => void;
  onRadioToggle: () => void;
  onPlayRadio: (radio: TimedSample<OpenF1TeamRadio>) => void;
  onStopRadio: () => void;
  onPauseRadio: () => void;
  onResumeRadio: () => void;
  onMarkerClick?: (timestampMs: number) => void;
};

export type SessionPickerProps = {
  year: number;
  round: number;
  sessionType: SessionType;
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
  yearOptions?: number[];
  isLoading?: boolean;
  onYearChange: (year: number) => void;
  onRoundChange: (round: number) => void;
  onSessionTypeChange: (sessionType: SessionType) => void;
};

export type TelemetryPanelProps = {
  summary: TelemetrySummary;
  rows: TelemetryRow[];
  activeOvertakes?: OpenF1Overtake[];
  isLoading?: boolean;
};

export type MarkerLegendProps = {
  hasEvents: boolean;
  legendCollapsed: boolean;
  onToggleLegendCollapsed: () => void;
  shortcutsCollapsed: boolean;
  onToggleShortcutsCollapsed: () => void;
};

export type EventsPanelProps = {
  events: TimelineEvent[];
  startTimeMs: number;
  currentTimeMs: number;
  isPlaying: boolean;
  radioEnabled: boolean;
  isRadioPlaying: boolean;
  currentRadio: TimedSample<OpenF1TeamRadio> | null;
  onPlayRadio: (radio: TimedSample<OpenF1TeamRadio>) => void;
  onStopRadio: () => void;
  hasEvents: boolean;
  legendCollapsed: boolean;
  shortcutsCollapsed: boolean;
  onToggleLegendCollapsed: () => void;
  onToggleShortcutsCollapsed: () => void;
  onSelectEvent: (timestampMs: number) => void;
};
