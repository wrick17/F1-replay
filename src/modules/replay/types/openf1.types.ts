export type OpenF1Meeting = {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  year: number;
  country_name: string;
  circuit_short_name: string;
  date_start: string;
  date_end: string;
};

export type OpenF1Session = {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  year: number;
};

export type OpenF1Driver = {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  broadcast_name?: string | null;
  team_name: string;
  team_colour: string;
  headshot_url: string | null;
};

export type OpenF1Location = {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number;
};

export type OpenF1Position = {
  date: string;
  driver_number: number;
  position: number;
};

export type OpenF1Stint = {
  driver_number: number;
  compound: string;
  lap_start: number;
  lap_end: number;
};

export type OpenF1Lap = {
  driver_number: number;
  lap_number: number;
  date_start: string;
  lap_duration: number;
  is_pit_out_lap: boolean;
};

export type TimedSample<T> = T & {
  timestampMs: number;
};

export type ReplayTelemetry = {
  locations: TimedSample<OpenF1Location>[];
  positions: TimedSample<OpenF1Position>[];
  stints: OpenF1Stint[];
  laps: TimedSample<OpenF1Lap>[];
};

export type ReplaySessionData = {
  meeting: OpenF1Meeting;
  session: OpenF1Session;
  drivers: OpenF1Driver[];
  telemetryByDriver: Record<number, ReplayTelemetry>;
  sessionStartMs: number;
  sessionEndMs: number;
};
