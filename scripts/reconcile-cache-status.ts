import { $ } from "bun";

type AttemptRow = {
  session_key: number;
};

const selectSql =
  "SELECT session_key FROM warm_session_attempts ORDER BY session_key ASC";

const fetchRows = async () => {
  const raw = await $`bunx wrangler d1 execute openf1-cache-warmer --remote --json --command ${selectSql}`.text();
  const parsed = JSON.parse(raw) as Array<{ results?: AttemptRow[] }>;
  return parsed?.[0]?.results ?? [];
};

const toState = (status: number): "hit" | "missing" | "failed" => {
  if (status === 200) return "hit";
  if (status === 202) return "missing";
  return "failed";
};

const run = async () => {
  const rows = await fetchRows();
  if (!rows.length) {
    console.log("No rows found.");
    return;
  }

  const nowIso = new Date().toISOString();
  let bothHit = 0;
  let missingOrFailed = 0;

  const updates: string[] = [];

  for (const row of rows) {
    const sessionKey = Number(row.session_key);
    if (!Number.isFinite(sessionKey)) continue;

    const replayResp = await fetch(
      `https://openf1-proxy.wrick17worker.workers.dev/replay?session_key=${sessionKey}`,
    );
    const telemetryResp = await fetch(
      `https://openf1-car-telemetry.wrick17worker.workers.dev/car-telemetry?session_key=${sessionKey}`,
    );

    const replayState = toState(replayResp.status);
    const telemetryState = toState(telemetryResp.status);
    const cacheReady = replayState === "hit" && telemetryState === "hit";

    if (cacheReady) bothHit += 1;
    else missingOrFailed += 1;

    const errorValue =
      replayResp.status >= 400 || telemetryResp.status >= 400
        ? `'Probe failure replay=${replayResp.status} telemetry=${telemetryResp.status}'`
        : "NULL";
    const completedValue = cacheReady ? `COALESCE(completed_at, '${nowIso}')` : "NULL";

    updates.push(
      `UPDATE warm_session_attempts SET replay_status='${replayState}', telemetry_status='${telemetryState}', last_error=${errorValue}, completed_at=${completedValue}, warm_in_progress=0, warm_started_at=NULL, updated_at='${nowIso}' WHERE session_key=${sessionKey};`,
    );
  }

  await $`bunx wrangler d1 execute openf1-cache-warmer --remote --command ${updates.join("\n")}`;
  console.log(
    `Reconciled ${rows.length} rows. both_hit=${bothHit} missing_or_failed=${missingOrFailed}`,
  );
};

await run();
