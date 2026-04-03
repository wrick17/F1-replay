import { useShooAuth } from "@shoojs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OPS_CACHE_CALLBACK_PATH } from "../../../app/routing";
import {
  type DashboardSessionRow,
  getDashboardRows,
  getDashboardSession,
  loginDashboardWithShooToken,
  logoutDashboard,
  probeDashboardRows,
  REMOTE_CACHE_OPS_ENABLED,
  REMOTE_CACHE_PROBES_ENABLED,
  type WarmAllBatchState,
  warmAllMissingDashboardSessions,
  warmDashboardSession,
} from "../api/cacheWarmer.client";
import {
  byMissingThenNewestUpdate,
  filterDashboardRows,
  shouldShowRowError,
} from "../services/opsDashboard.service";

const dateLabel = (value: string | null) => {
  if (!value) return "n/a";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return new Date(parsed).toLocaleString();
};

const statusBadgeClass = (status: string) => {
  if (status === "hit" || status === "warmed")
    return "border-emerald-300/40 bg-emerald-500/15 text-emerald-200";
  if (status === "failed") return "border-red-300/40 bg-red-500/15 text-red-200";
  if (status === "missing") return "border-amber-300/40 bg-amber-500/15 text-amber-200";
  return "border-zinc-400/30 bg-zinc-600/20 text-zinc-200";
};

export const OpsCacheDashboardPage = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(
    REMOTE_CACHE_OPS_ENABLED ? null : true,
  );
  const [rows, setRows] = useState<DashboardSessionRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [warmingSessionKeys, setWarmingSessionKeys] = useState<Set<number>>(new Set());
  const [batchState, setBatchState] = useState<WarmAllBatchState | null>(null);
  const [authExchangeInFlight, setAuthExchangeInFlight] = useState(false);
  const lastExchangedToken = useRef<string | null>(null);
  const refreshToken = useRef(0);
  const {
    identity,
    loading: shooLoading,
    error: shooError,
    signIn,
    clearIdentity,
  } = useShooAuth({
    callbackPath: OPS_CACHE_CALLBACK_PATH,
    requestPii: true,
  });

  const refreshRows = useCallback(async () => {
    if (!REMOTE_CACHE_OPS_ENABLED) {
      setError("Remote cache ops are disabled by configuration.");
      return;
    }
    const token = refreshToken.current + 1;
    refreshToken.current = token;
    setLoadingRows(true);
    setError(null);
    try {
      const response = await getDashboardRows();
      if (refreshToken.current !== token) return;
      setRows(response.rows);
      setBatchState(response.batch);
      setLastUpdatedAt(new Date().toISOString());
      if (!REMOTE_CACHE_PROBES_ENABLED || !response.rows.length) return;
      const probeKeys = response.rows.slice(0, 20).map((row) => row.session_key);
      const probeResult = await probeDashboardRows(probeKeys);
      if (refreshToken.current !== token) return;
      if (probeResult.rows.length) {
        const probeMap = new Map(probeResult.rows.map((row) => [row.session_key, row]));
        setRows((previous) => previous.map((row) => probeMap.get(row.session_key) ?? row));
      }
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : "Failed to refresh dashboard";
      setError(message);
    } finally {
      if (refreshToken.current === token) {
        setLoadingRows(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!REMOTE_CACHE_OPS_ENABLED) return;
    if (authenticated !== true) return;
    if (!batchState || batchState.status !== "running") return;
    const interval = window.setInterval(() => {
      void refreshRows();
    }, 3000);
    return () => {
      window.clearInterval(interval);
    };
  }, [authenticated, batchState, refreshRows]);

  useEffect(() => {
    if (!REMOTE_CACHE_OPS_ENABLED) return;
    if (authenticated !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await getDashboardSession();
        if (cancelled) return;
        setAuthenticated(session.authenticated);
        if (session.authenticated) {
          await refreshRows();
        }
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, refreshRows]);

  useEffect(() => {
    if (!REMOTE_CACHE_OPS_ENABLED) return;
    if (authenticated !== false) return;
    if (!identity.token) return;
    if (lastExchangedToken.current === identity.token) return;

    let cancelled = false;
    setAuthExchangeInFlight(true);
    setError(null);

    void (async () => {
      try {
        await loginDashboardWithShooToken(identity.token as string);
        if (cancelled) return;
        lastExchangedToken.current = identity.token as string;
        setAuthenticated(true);
        await refreshRows();
      } catch (loginError) {
        if (cancelled) return;
        const message = loginError instanceof Error ? loginError.message : "Login failed";
        setError(message);
      } finally {
        if (!cancelled) {
          setAuthExchangeInFlight(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticated, identity.token, refreshRows]);

  const filtered = useMemo(
    () => filterDashboardRows(rows, search).sort(byMissingThenNewestUpdate),
    [rows, search],
  );

  const setSessionWarming = useCallback((sessionKey: number, warming: boolean) => {
    setWarmingSessionKeys((prev) => {
      const next = new Set(prev);
      if (warming) next.add(sessionKey);
      else next.delete(sessionKey);
      return next;
    });
  }, []);

  const isRowWarming = useCallback(
    (row: DashboardSessionRow) =>
      row.warm_in_progress === 1 || warmingSessionKeys.has(row.session_key),
    [warmingSessionKeys],
  );

  const isBatchRunning = batchState?.status === "running";
  const warmAllProgress = useMemo(
    () => ({
      total: batchState?.total ?? 0,
      done: batchState?.done ?? 0,
      active: batchState?.active ?? 0,
      failed: batchState?.failed ?? 0,
    }),
    [batchState],
  );

  const warmAllMissing = useCallback(async () => {
    if (!REMOTE_CACHE_OPS_ENABLED) {
      setError("Remote cache ops are disabled by configuration.");
      return;
    }
    setError(null);
    try {
      const response = await warmAllMissingDashboardSessions();
      setBatchState(response.batch);
      await refreshRows();
    } catch (warmError) {
      const message = warmError instanceof Error ? warmError.message : "Warm all action failed";
      setError(message);
    }
  }, [refreshRows]);

  if (authenticated === null) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-white">
        <div className="rounded-xl border border-white/20 bg-black/45 px-5 py-3 text-sm tracking-wide backdrop-blur">
          Checking dashboard session...
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-black/50 p-6 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Ops Login</p>
          <h1 className="mt-2 text-2xl font-semibold">Cache Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-300">
            Sign in to inspect session cache state and trigger manual warmups.
          </p>
          {authExchangeInFlight || shooLoading ? (
            <p className="mt-4 text-sm text-zinc-200">Completing sign-in...</p>
          ) : null}
          {shooError && <p className="mt-3 text-sm text-red-200">{shooError}</p>}
          {error && <p className="mt-3 text-sm text-red-200">{error}</p>}
          <button
            type="button"
            onClick={() => {
              setError(null);
              void signIn({
                requestPii: true,
                returnTo: "/ops/cache",
              });
            }}
            disabled={authExchangeInFlight || shooLoading}
            className="mt-4 inline-flex items-center rounded-lg border border-red-300/50 bg-red-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/30"
          >
            Sign In With Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-5 text-white md:px-8">
      <header className="mx-auto flex w-full max-w-[1300px] flex-col gap-3 rounded-2xl border border-white/15 bg-black/45 px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-300">Operations</p>
          <h1 className="text-3xl font-semibold">Cache Ops Dashboard</h1>
          <p className="text-sm text-zinc-300">
            Manual refresh only. Per-session warm action triggers replay + telemetry warmup.
          </p>
          {!REMOTE_CACHE_OPS_ENABLED ? (
            <p className="mt-1 text-sm text-amber-200">
              Remote cache ops are disabled by configuration. Set `
              RSBUILD_ENABLE_REMOTE_CACHE_OPS=true ` to enable.
            </p>
          ) : null}
        </div>
        <div className="w-full max-w-[680px] md:w-[680px]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => void refreshRows()}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] hover:bg-white/15"
              disabled={!REMOTE_CACHE_OPS_ENABLED || loadingRows}
            >
              {loadingRows ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => void warmAllMissing()}
              className="w-full rounded-lg border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 hover:bg-amber-500/30"
              disabled={!REMOTE_CACHE_OPS_ENABLED || isBatchRunning || loadingRows}
            >
              {isBatchRunning
                ? `Warming ${warmAllProgress.done}/${warmAllProgress.total}`
                : "Warm All Missing"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!REMOTE_CACHE_OPS_ENABLED) return;
                void (async () => {
                  try {
                    await logoutDashboard();
                  } finally {
                    clearIdentity();
                    lastExchangedToken.current = null;
                    setAuthenticated(false);
                    setRows([]);
                  }
                })();
              }}
              className="w-full rounded-lg border border-red-300/40 bg-red-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-red-100 hover:bg-red-500/30"
              disabled={!REMOTE_CACHE_OPS_ENABLED}
            >
              Logout
            </button>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by year/round/meeting/session/status/key"
            className="mt-2 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm"
          />
          {isBatchRunning && warmAllProgress.total > 0 ? (
            <div className="mt-2 rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                Batch Progress: {warmAllProgress.done}/{warmAllProgress.total} Processed (
                {warmAllProgress.active} In Flight
                {warmAllProgress.failed > 0 ? `, ${warmAllProgress.failed} Failed` : ""}
                {warmAllProgress.done - warmAllProgress.failed > 0
                  ? `, ${warmAllProgress.done - warmAllProgress.failed} Succeeded`
                  : ""}
                )
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-black/40">
                <div
                  className="h-full bg-amber-400/80 transition-[width] duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((warmAllProgress.done / warmAllProgress.total) * 100),
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <section className="mx-auto mt-5 w-full max-w-[1300px] rounded-2xl border border-white/15 bg-black/40 p-4">
        <div className="flex items-center justify-between text-xs text-zinc-300">
          <p>Rows: {filtered.length}</p>
          <p>Last updated: {dateLabel(lastUpdatedAt)}</p>
        </div>
        {error && <p className="mt-3 text-sm text-red-200">{error}</p>}
        {!error && batchState?.status === "failed" && batchState.last_error ? (
          <p className="mt-3 text-sm text-red-200">Batch failed: {batchState.last_error}</p>
        ) : null}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1150px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/15 text-zinc-300">
                <th className="px-2 py-2">Session Name</th>
                <th className="px-2 py-2">Session Key</th>
                <th className="px-2 py-2">Replay</th>
                <th className="px-2 py-2">Telemetry</th>
                <th className="px-2 py-2">Attempts</th>
                <th className="px-2 py-2">Last Attempt</th>
                <th className="px-2 py-2">Next Retry</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.session_key} className="border-b border-white/10 align-top">
                  <td className="px-2 py-2">
                    <p className="font-semibold">
                      {row.year} R{row.round} {row.session_type}
                    </p>
                    <p className="text-zinc-300">
                      {row.meeting_name ?? `Meeting ${row.meeting_key}`}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-zinc-300">{row.session_key}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 ${statusBadgeClass(row.replay_status)}`}
                    >
                      {row.replay_status}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 ${statusBadgeClass(row.telemetry_status)}`}
                    >
                      {row.telemetry_status}
                    </span>
                  </td>
                  <td className="px-2 py-2">{row.attempt_count}</td>
                  <td className="px-2 py-2">{dateLabel(row.last_attempt_at)}</td>
                  <td className="px-2 py-2">{dateLabel(row.next_retry_at)}</td>
                  <td className="max-w-[320px] px-2 py-2">
                    {shouldShowRowError(row) ? (
                      <p className="text-red-200">Error: {row.last_error}</p>
                    ) : (
                      <p className="text-zinc-200">Completed: {dateLabel(row.completed_at)}</p>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      disabled={!REMOTE_CACHE_OPS_ENABLED || isRowWarming(row) || isBatchRunning}
                      onClick={() => {
                        if (!REMOTE_CACHE_OPS_ENABLED) {
                          setError("Remote cache ops are disabled by configuration.");
                          return;
                        }
                        setSessionWarming(row.session_key, true);
                        setError(null);
                        void (async () => {
                          try {
                            const result = await warmDashboardSession(row.session_key);
                            setRows((prev) =>
                              prev.map((current) =>
                                current.session_key === row.session_key ? result.row : current,
                              ),
                            );
                            setLastUpdatedAt(new Date().toISOString());
                          } catch (warmError) {
                            const message =
                              warmError instanceof Error ? warmError.message : "Warm action failed";
                            setError(message);
                          } finally {
                            setSessionWarming(row.session_key, false);
                          }
                        })();
                      }}
                      className="rounded-lg border border-red-300/40 bg-red-500/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-100 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRowWarming(row) ? "Warming..." : "Warm Now"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
};
