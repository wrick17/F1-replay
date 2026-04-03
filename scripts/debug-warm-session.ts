import { buildCarTelemetryPayload } from "../src/modules/replay/warm/buildCarTelemetryPayload";
import { buildReplayPayload } from "../src/modules/replay/warm/buildReplayPayload";
import type { OpenF1Meeting, OpenF1Session, ReplaySessionData } from "../src/modules/replay/types/openf1.types";
import type { CarTelemetryPayload } from "../src/modules/replay/types/carTelemetry.types";
import { ApiError } from "./warm-caches/errors";
import { createOpenF1Client } from "./warm-caches/openf1";
import { createCarTelemetryWorkerClient, createReplayWorkerClient } from "./warm-caches/workers";

const LOCATION_WINDOW_MS = 180000;
const POSITION_WINDOW_MS = 600000;
const POSITION_OFFSET_MS = 3600000;
const CAR_DATA_WINDOW_MS = 600000;

const OPENF1_BASE_URL = "https://api.openf1.org/v1";
const REPLAY_WORKER_BASE_URL = "https://openf1-proxy.wrick17worker.workers.dev";
const CAR_WORKER_BASE_URL = "https://openf1-car-telemetry.wrick17worker.workers.dev";

const validateReplayPayload = (payload: ReplaySessionData) => {
  if (payload.drivers.length === 0) {
    throw new Error("Replay payload has no drivers");
  }
  const hasTelemetry = Object.values(payload.telemetryByDriver).some(
    (entry) => entry.locations.length > 0 || entry.positions.length > 0,
  );
  if (!hasTelemetry) {
    throw new Error("Replay payload has no location/position telemetry");
  }
};

const validateCarPayload = (payload: CarTelemetryPayload) => {
  const sampleCount = Object.values(payload.byDriver).reduce((total, samples) => total + samples.length, 0);
  if (sampleCount === 0) {
    throw new Error("Car telemetry payload has no samples");
  }
};

const formatError = (error: unknown) => {
  if (error instanceof ApiError) {
    return `${error.message} [status=${error.status}] [url=${error.url}]`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
};

const run = async (sessionKey: number) => {
  const appendLog = (line: string) => console.log(line);
  const openf1 = createOpenF1Client(OPENF1_BASE_URL, appendLog);
  const replayWorker = createReplayWorkerClient(REPLAY_WORKER_BASE_URL, appendLog);
  const carWorker = createCarTelemetryWorkerClient(CAR_WORKER_BASE_URL, appendLog);

  const sessions = await openf1.fetchOpenF1<OpenF1Session[]>("sessions", { session_key: sessionKey });
  const session = sessions[0];
  if (!session) {
    throw new Error(`Session not found: ${sessionKey}`);
  }
  const meetings = await openf1.fetchOpenF1<OpenF1Meeting[]>("meetings", { meeting_key: session.meeting_key });
  const meeting = meetings[0];
  if (!meeting) {
    throw new Error(`Meeting not found: ${session.meeting_key}`);
  }

  console.log(`\n=== session_key=${sessionKey} ${meeting.meeting_name} ${session.session_name} ===`);

  try {
    const replay = await replayWorker.fetchReplayFromWorker(sessionKey);
    if (replay.status === "hit") {
      console.log("Replay cache: HIT");
    } else {
      console.log("Replay cache: MISS, building payload...");
      const replayPayload = await buildReplayPayload(
        meeting,
        session,
        {
          appendLog,
          fetchOpenF1: openf1.fetchOpenF1,
          fetchChunked: openf1.fetchChunked,
        },
        {
          locationWindowMs: LOCATION_WINDOW_MS,
          positionWindowMs: POSITION_WINDOW_MS,
          positionOffsetMs: POSITION_OFFSET_MS,
        },
      );
      validateReplayPayload(replayPayload);
      await replayWorker.uploadReplayToWorker(sessionKey, replayPayload, replay.uploadToken);
      const after = await replayWorker.fetchReplayFromWorker(sessionKey);
      console.log(`Replay cache after upload: ${after.status.toUpperCase()}`);
    }
  } catch (error) {
    console.error(`Replay path failed: ${formatError(error)}`);
  }

  try {
    const car = await carWorker.fetchCarTelemetryFromWorker(sessionKey);
    if (car.status === "hit") {
      console.log("Car telemetry cache: HIT");
    } else {
      console.log("Car telemetry cache: MISS, building payload...");
      const carPayload = await buildCarTelemetryPayload(
        session,
        {
          appendLog,
          fetchChunked: openf1.fetchChunked,
        },
        {
          carDataWindowMs: CAR_DATA_WINDOW_MS,
        },
      );
      validateCarPayload(carPayload);
      await carWorker.uploadCarTelemetryToWorker(sessionKey, carPayload, car.uploadToken);
      const after = await carWorker.fetchCarTelemetryFromWorker(sessionKey);
      console.log(`Car telemetry cache after upload: ${after.status.toUpperCase()}`);
    }
  } catch (error) {
    console.error(`Car telemetry path failed: ${formatError(error)}`);
  }
};

const raw = Bun.argv[2];
if (!raw) {
  console.error("Usage: bun scripts/debug-warm-session.ts <session_key>");
  process.exit(1);
}
const key = Number(raw);
if (!Number.isFinite(key)) {
  console.error(`Invalid session key: ${raw}`);
  process.exit(1);
}

await run(key);
