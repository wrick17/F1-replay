import type { OpenF1Session } from "../../src/modules/replay/types/openf1.types";
import { sleep } from "../../src/modules/replay/api/rateLimiter";
import {
  API_BASE_URL,
  DASHBOARD_PORT,
  SESSION_DELAY_MS,
  SUPPORTED_SESSION_TYPES,
  WORKER_BASE_URL,
} from "./config";
import { startDashboard } from "./dashboard";
import { initLogger } from "./logger";
import {
  buildMeetingIndex,
  fetchAllMeetings,
  filterEndedMeetings,
  findSessionByType,
} from "./meetings";
import { createOpenF1Client } from "./openf1";
import type { WarmStatus } from "./types";
import { createWorkerClient } from "./worker";
import { warmSession } from "./warmSession";

const run = async () => {
  const now = Date.now();
  const status: WarmStatus = {
    startedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    current: null,
    totalSessions: 0,
    warmed: 0,
    skipped: 0,
    failed: 0,
    recentFailures: [],
    recentLogs: [],
  };

  const { appendLog, touchStatus } = initLogger(status);
  const openf1 = createOpenF1Client(API_BASE_URL, appendLog);
  const worker = createWorkerClient(WORKER_BASE_URL, appendLog);

  const dashboardUrl = startDashboard(status, DASHBOARD_PORT);
  appendLog(`Dashboard: ${dashboardUrl}`);
  appendLog(`Using OpenF1: ${API_BASE_URL}`);
  appendLog(`Using worker: ${WORKER_BASE_URL}`);
  appendLog("Log file: ./warm-replay-cache.log");

  const meetings = filterEndedMeetings(await fetchAllMeetings(openf1.fetchOpenF1), now);
  const { byYear, years } = buildMeetingIndex(meetings);

  for (const year of years) {
    const yearMeetings = byYear.get(year) ?? [];
    for (let index = 0; index < yearMeetings.length; index += 1) {
      const meeting = yearMeetings[index];
      const round = index + 1;
      const sessions = await openf1.fetchOpenF1<OpenF1Session[]>("sessions", {
        meeting_key: meeting.meeting_key,
      });
      const endedSessions = sessions.filter((session) =>
        Number.isFinite(Date.parse(session.date_end)) && Date.parse(session.date_end) <= now,
      );

      for (const sessionType of SUPPORTED_SESSION_TYPES) {
        const session = findSessionByType(endedSessions, sessionType);
        if (!session) {
          appendLog(
            `Missing ${sessionType} for ${year} round ${round} (${meeting.meeting_name}).`,
          );
          continue;
        }

        status.totalSessions += 1;
        const label = `${year} R${round} ${meeting.meeting_name} - ${sessionType}`;
        status.current = label;
        touchStatus();
        appendLog(`[Warm] Start ${label}`);
        try {
          const cached = await worker.fetchReplayFromWorker(session.session_key);
          if (cached.status === "hit") {
            status.skipped += 1;
            appendLog(`Cache hit: ${label}`);
          } else {
            appendLog(`Warming: ${label}`);
            await warmSession(meeting, session, cached.uploadToken, {
              appendLog,
              fetchOpenF1: openf1.fetchOpenF1,
              fetchChunked: openf1.fetchChunked,
              uploadReplayToWorker: worker.uploadReplayToWorker,
            });
            status.warmed += 1;
            appendLog(`Warmed: ${label}`);
          }
        } catch (error) {
          status.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          status.recentFailures.unshift(`${label}: ${message}`);
          status.recentFailures = status.recentFailures.slice(0, 5);
          appendLog(`Failed: ${label} (${message})`);
        }

        touchStatus();
        appendLog(`[Warm] Done ${label}`);

        if (SESSION_DELAY_MS > 0) {
          await sleep(SESSION_DELAY_MS);
        }
      }
    }
  }

  appendLog(
    `Done. Sessions=${status.totalSessions} warmed=${status.warmed} hits=${status.skipped} delayMs=${SESSION_DELAY_MS}.`,
  );
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Cache warmer failed: ${message}`);
  process.exitCode = 1;
});
