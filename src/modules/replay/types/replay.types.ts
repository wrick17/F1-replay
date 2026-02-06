import type { NormalizedPosition } from "../utils/telemetry.util";
import type { OpenF1Meeting, OpenF1Session } from "./openf1.types";

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
  position: number | null;
  lap: number | null;
  compound: string | null;
};

export type TrackViewProps = {
  trackPath: NormalizedPosition[];
  driverStates: Record<number, DriverRenderState>;
  driverNames: Record<number, string>;
  selectedDrivers: number[];
  className?: string;
};

export type ControlsBarProps = {
  isPlaying: boolean;
  isBuffering: boolean;
  speed: number;
  currentTimeMs: number;
  startTimeMs: number;
  endTimeMs: number;
  canPlay: boolean;
  onTogglePlay: () => void;
  onSpeedChange: (value: number) => void;
  onSeek: (timestampMs: number) => void;
};

export type SessionPickerProps = {
  year: number;
  round: number;
  sessionType: SessionType;
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
  yearOptions?: number[];
  onYearChange: (year: number) => void;
  onRoundChange: (round: number) => void;
  onSessionTypeChange: (sessionType: SessionType) => void;
};

export type TelemetryPanelProps = {
  summary: TelemetrySummary;
  rows: TelemetryRow[];
};
