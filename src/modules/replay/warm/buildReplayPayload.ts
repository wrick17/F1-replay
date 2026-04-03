import type {
  OpenF1Driver,
  OpenF1Lap,
  OpenF1Location,
  OpenF1Meeting,
  OpenF1Overtake,
  OpenF1Pit,
  OpenF1Position,
  OpenF1RaceControl,
  OpenF1Session,
  OpenF1Stint,
  OpenF1TeamRadio,
  OpenF1Weather,
  ReplaySessionData,
  TimedSample,
} from "../types/openf1.types";
import { groupByDriverNumber, sortByTimestamp, withTimestamp } from "../utils/telemetry.util";

type BuildReplayPayloadDeps = {
  appendLog: (line: string) => void;
  fetchOpenF1: <T>(path: string, params: Record<string, string | number>) => Promise<T>;
  fetchChunked: <T extends { date?: string }>(
    path: string,
    params: Record<string, string | number>,
    startMs: number,
    endMs: number,
    windowMs: number,
    onChunk: (chunk: T[], chunkEndMs: number) => void,
  ) => Promise<number>;
};

type BuildReplayPayloadConfig = {
  locationWindowMs: number;
  positionWindowMs: number;
  positionOffsetMs: number;
};

const toMs = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed;
};

type ReplayTelemetryMap = Record<
  number,
  {
    locations: TimedSample<OpenF1Location>[];
    positions: TimedSample<OpenF1Position>[];
    stints: OpenF1Stint[];
    laps: TimedSample<OpenF1Lap>[];
  }
>;

const createTelemetryMap = (drivers: OpenF1Driver[]) => {
  const initial: ReplayTelemetryMap = {};
  drivers.forEach((driver) => {
    initial[driver.driver_number] = {
      locations: [],
      positions: [],
      stints: [],
      laps: [],
    };
  });
  return initial;
};

const chunkAppend = <T extends { driver_number: number }>(
  telemetryMap: Record<number, T[]>,
  samples: T[],
) => {
  for (const sample of samples) {
    const list = telemetryMap[sample.driver_number];
    if (!list) continue;
    list.push(sample);
  }
};

export const buildReplayPayload = async (
  meeting: OpenF1Meeting,
  session: OpenF1Session,
  deps: BuildReplayPayloadDeps,
  config: BuildReplayPayloadConfig,
): Promise<ReplaySessionData> => {
  const { appendLog, fetchOpenF1, fetchChunked } = deps;
  const { locationWindowMs, positionWindowMs, positionOffsetMs } = config;

  appendLog(`[Warm] Building replay payload session_key=${session.session_key}`);
  const sessionStartMs = toMs(session.date_start);
  const sessionEndMs = toMs(session.date_end);

  const drivers = await fetchOpenF1<OpenF1Driver[]>("drivers", {
    session_key: session.session_key,
  });
  const telemetryByDriver = createTelemetryMap(drivers);

  const [stints, laps, teamRadios, overtakes, weather, raceControl, pits] = await Promise.all([
    fetchOpenF1<OpenF1Stint[]>("stints", { session_key: session.session_key }),
    fetchOpenF1<OpenF1Lap[]>("laps", { session_key: session.session_key }),
    fetchOpenF1<OpenF1TeamRadio[]>("team_radio", { session_key: session.session_key }),
    fetchOpenF1<OpenF1Overtake[]>("overtakes", { session_key: session.session_key }),
    fetchOpenF1<OpenF1Weather[]>("weather", { session_key: session.session_key }),
    fetchOpenF1<OpenF1RaceControl[]>("race_control", { session_key: session.session_key }),
    fetchOpenF1<OpenF1Pit[]>("pit", { session_key: session.session_key }),
  ]);
  appendLog(
    `[Warm] Base data: stints=${stints.length} laps=${laps.length} radio=${teamRadios.length} overtakes=${overtakes.length} weather=${weather.length} rc=${raceControl.length} pits=${pits.length}`,
  );

  const lapsTimed = withTimestamp(laps);
  const lapsGrouped = groupByDriverNumber(lapsTimed);
  Object.entries(lapsGrouped).forEach(([driverKey, driverLaps]) => {
    const driverNumber = Number(driverKey);
    if (!telemetryByDriver[driverNumber]) {
      telemetryByDriver[driverNumber] = {
        locations: [],
        positions: [],
        stints: [],
        laps: [],
      };
    }
    telemetryByDriver[driverNumber].laps = sortByTimestamp(driverLaps);
  });

  const stintsGrouped = groupByDriverNumber(stints);
  Object.entries(stintsGrouped).forEach(([driverKey, driverStints]) => {
    const driverNumber = Number(driverKey);
    if (!telemetryByDriver[driverNumber]) {
      telemetryByDriver[driverNumber] = {
        locations: [],
        positions: [],
        stints: [],
        laps: [],
      };
    }
    telemetryByDriver[driverNumber].stints = driverStints;
  });

  const handleLocationsChunk = (chunk: OpenF1Location[]) => {
    const normalized = withTimestamp(chunk);
    chunkAppend(
      Object.fromEntries(
        Object.keys(telemetryByDriver).map((key) => [
          Number(key),
          telemetryByDriver[Number(key)].locations,
        ]),
      ),
      normalized,
    );
  };

  const handlePositionChunk = (chunk: OpenF1Position[]) => {
    const normalized = withTimestamp(chunk);
    chunkAppend(
      Object.fromEntries(
        Object.keys(telemetryByDriver).map((key) => [
          Number(key),
          telemetryByDriver[Number(key)].positions,
        ]),
      ),
      normalized,
    );
  };

  const positionStartMs = Math.max(0, sessionStartMs - positionOffsetMs);
  appendLog(
    `[Warm] Telemetry windows: location=${locationWindowMs}ms position=${positionWindowMs}ms`,
  );
  await Promise.all([
    fetchChunked<OpenF1Location>(
      "location",
      { session_key: session.session_key },
      sessionStartMs,
      sessionEndMs,
      locationWindowMs,
      handleLocationsChunk,
    ),
    fetchChunked<OpenF1Position>(
      "position",
      { session_key: session.session_key },
      positionStartMs,
      sessionEndMs,
      positionWindowMs,
      handlePositionChunk,
    ),
  ]);
  appendLog(`[Warm] Telemetry chunking complete session_key=${session.session_key}`);

  Object.values(telemetryByDriver).forEach((telemetry) => {
    telemetry.locations = sortByTimestamp(telemetry.locations as TimedSample<OpenF1Location>[]);
    telemetry.positions = sortByTimestamp(telemetry.positions as TimedSample<OpenF1Position>[]);
  });

  return {
    meeting,
    session,
    drivers,
    telemetryByDriver,
    sessionStartMs,
    sessionEndMs,
    teamRadios: withTimestamp(teamRadios),
    overtakes: withTimestamp(overtakes),
    weather: withTimestamp(weather),
    raceControl: withTimestamp(raceControl),
    pits: withTimestamp(pits),
  } satisfies ReplaySessionData;
};
