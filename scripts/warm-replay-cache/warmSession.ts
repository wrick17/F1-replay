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
} from "../../src/modules/replay/types/openf1.types";
import {
  groupByDriverNumber,
  sortByTimestamp,
  withTimestamp,
} from "../../src/modules/replay/utils/telemetry.util";
import {
  LOCATION_WINDOW_MS,
  POSITION_OFFSET_MS,
  POSITION_WINDOW_MS,
} from "./config";
import { chunkAppend, createTelemetryMap, toMs } from "./telemetry";

type WarmSessionDeps = {
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
  uploadReplayToWorker: (
    sessionKey: number,
    payload: ReplaySessionData,
    uploadToken: string,
  ) => Promise<void>;
};

export const warmSession = async (
  meeting: OpenF1Meeting,
  session: OpenF1Session,
  uploadToken: string,
  deps: WarmSessionDeps,
) => {
  const { appendLog, fetchOpenF1, fetchChunked, uploadReplayToWorker } = deps;
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

  const baseData = {
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

  const positionStartMs = Math.max(0, sessionStartMs - POSITION_OFFSET_MS);
  appendLog(
    `[Warm] Telemetry windows: location=${LOCATION_WINDOW_MS}ms position=${POSITION_WINDOW_MS}ms`,
  );
  await Promise.all([
    fetchChunked<OpenF1Location>(
      "location",
      { session_key: session.session_key },
      sessionStartMs,
      sessionEndMs,
      LOCATION_WINDOW_MS,
      handleLocationsChunk,
    ),
    fetchChunked<OpenF1Position>(
      "position",
      { session_key: session.session_key },
      positionStartMs,
      sessionEndMs,
      POSITION_WINDOW_MS,
      handlePositionChunk,
    ),
  ]);
  appendLog(`[Warm] Telemetry chunking complete session_key=${session.session_key}`);

  Object.values(telemetryByDriver).forEach((telemetry) => {
    telemetry.locations = sortByTimestamp(
      telemetry.locations as TimedSample<OpenF1Location>[],
    );
    telemetry.positions = sortByTimestamp(
      telemetry.positions as TimedSample<OpenF1Position>[],
    );
  });

  await uploadReplayToWorker(session.session_key, baseData, uploadToken);
  appendLog(`[Warm] Upload complete session_key=${session.session_key}`);
};
