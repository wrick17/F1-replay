export type ReplaySessionType = "Qualifying" | "Sprint" | "Race";

export type ReplayAvailability = {
  available: boolean;
  sessionType: ReplaySessionType | null;
  detailsHref: string | null;
  replayHref: string | null;
};

export type HomeRaceStatus = "completed" | "upcoming" | "live";

export type HomeRaceCard = {
  id: string;
  year: number;
  round: number;
  meetingName: string;
  circuitName: string;
  locality: string;
  country: string;
  startTime: string;
  status: HomeRaceStatus;
  replay: ReplayAvailability;
};

export type ReplaySessionCard = {
  id: string;
  year: number;
  round: number;
  meetingName: string;
  circuitName: string;
  startTime: string;
  sessionType: ReplaySessionType;
  detailsHref: string;
  replayHref: string;
};

export type ReplaySessionYearGroup = {
  year: number;
  sessions: ReplaySessionCard[];
};

export type StandingsEntry = {
  id: string;
  position: number;
  points: number;
  wins: number;
  name: string;
  shortName: string;
  team: string;
  imageUrl: string;
  teamLogoUrl: string;
};

export type ConstructorStandingsEntry = {
  id: string;
  position: number;
  points: number;
  wins: number;
  name: string;
  logoUrl: string;
};

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  summary: string;
};

export type HomeDashboardData = {
  year: number;
  cards: HomeRaceCard[];
  completedCards: HomeRaceCard[];
  upcomingCards: HomeRaceCard[];
  nextRace: HomeRaceCard | null;
  latestReplayRace: HomeRaceCard | null;
  replaySessionsByYear: ReplaySessionYearGroup[];
  totalReplaySessions: number;
  standingsContextLabel: string | null;
  driverStandings: StandingsEntry[];
  constructorStandings: ConstructorStandingsEntry[];
  news: NewsItem[];
  warnings: string[];
};

export type ReplayEventDetails = {
  year: number;
  round: number;
  meetingKey: number;
  sessionKey: number;
  meetingName: string;
  officialMeetingName: string | null;
  circuitName: string;
  locality: string;
  country: string;
  startTime: string;
  sessionType: ReplaySessionType;
  detailsHref: string;
  replayHref: string;
  weekendSessions: ReplayEventSessionSummary[];
  sessionResults: ReplayEventSessionResult[];
  stints: ReplayEventStintSummary[];
  lapMetrics: ReplayEventLapMetric[];
};

export type ReplayEventSessionSummary = {
  id: string;
  sessionType: ReplaySessionType;
  sessionName: string;
  startTime: string;
  endTime: string;
  detailsHref: string;
  replayHref: string;
};

export type ReplayEventSessionResult = {
  sessionType: ReplaySessionType;
  title: string;
  rows: ReplayEventResultRow[];
};

export type ReplayEventResultRow = {
  position: number | null;
  driver: string;
  driverImageUrl: string;
  team: string;
  teamLogoUrl: string;
  grid: number | null;
  points: number | null;
  laps: number | null;
  status: string | null;
  time: string | null;
  q1: string | null;
  q2: string | null;
  q3: string | null;
};

export type ReplayEventStintSummary = {
  driverNumber: number;
  driver: string;
  driverImageUrl: string;
  acronym: string;
  team: string;
  teamLogoUrl: string;
  stintCount: number;
  totalLaps: number;
  stintLabels: string[];
};

export type ReplayEventLapMetric = {
  driverNumber: number;
  driver: string;
  driverImageUrl: string;
  acronym: string;
  team: string;
  teamLogoUrl: string;
  averageLapSeconds: number | null;
  bestLapSeconds: number | null;
  averageSector1Seconds: number | null;
  averageSector2Seconds: number | null;
  averageSector3Seconds: number | null;
  averageSpeedKph: number | null;
  peakSpeedKph: number | null;
};
