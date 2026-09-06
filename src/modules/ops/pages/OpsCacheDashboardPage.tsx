import { useEffect, useMemo, useState } from "react";
import type { ArchiveCatalog } from "../../archive/types";
import {
  ARCHIVE_CATALOG_URL,
  ARCHIVE_WORKFLOW_URL,
  byNewestSession,
  loadArchiveCatalog,
  summarizeArchive,
} from "../services/opsDashboard.service";

const dateLabel = (value: string | null) => {
  if (!value) return "Not available";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "Not available";
};

const statusClass = (healthy: boolean, failed: boolean) =>
  healthy
    ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200"
    : failed
      ? "border-red-300/40 bg-red-500/15 text-red-200"
      : "border-zinc-400/30 bg-zinc-600/20 text-zinc-200";

export const OpsCacheDashboardPage = () => {
  const [catalog, setCatalog] = useState<ArchiveCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadArchiveCatalog(controller.signal)
      .then((nextCatalog) => {
        setCatalog(nextCatalog);
        setCheckedAt(new Date().toISOString());
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Catalog request failed");
        setCheckedAt(new Date().toISOString());
      });
    return () => controller.abort();
  }, []);

  const inventory = useMemo(() => (catalog ? summarizeArchive(catalog) : null), [catalog]);
  const sessions = useMemo(
    () => (catalog ? [...catalog.sessions].sort(byNewestSession) : []),
    [catalog],
  );
  const healthy = Boolean(catalog) && !error;

  return (
    <main className="min-h-screen px-4 py-5 text-white md:px-8">
      <header className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 rounded-2xl border border-white/15 bg-black/45 px-5 py-5 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-300">Operations</p>
          <h1 className="text-3xl font-semibold">Replay archive</h1>
          <p className="mt-1 text-sm text-zinc-300">
            Static schema v2 catalog and published session inventory.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={ARCHIVE_CATALOG_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] hover:bg-white/15"
          >
            Open catalog
          </a>
          <a
            href={ARCHIVE_WORKFLOW_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-red-300/40 bg-red-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-red-100 hover:bg-red-500/30"
          >
            Publish on GitHub
          </a>
        </div>
      </header>

      <section className="mx-auto mt-5 grid w-full max-w-[1200px] gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <article className="rounded-xl border border-white/15 bg-black/40 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Catalog health</p>
          <p
            className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(healthy, Boolean(error))}`}
          >
            {error ? "Unavailable" : catalog ? "Healthy" : "Checking"}
          </p>
        </article>
        {[
          ["Sessions", inventory?.sessions],
          ["Meetings", inventory?.meetings],
          ["Seasons", inventory?.seasons],
          ["Car telemetry", inventory ? `${inventory.carReady}/${inventory.sessions}` : undefined],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-white/15 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value ?? "-"}</p>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-5 w-full max-w-[1200px] rounded-2xl border border-white/15 bg-black/40 p-4">
        <div className="flex flex-col gap-1 text-xs text-zinc-300 sm:flex-row sm:justify-between">
          <p>Catalog updated: {dateLabel(catalog?.updatedAt ?? null)}</p>
          <p>Checked: {dateLabel(checkedAt)}</p>
        </div>
        {error ? (
          <p className="mt-3 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-zinc-300">
          Publishing runs in the repository workflow. GitHub handles sign-in and repository access.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/15 text-zinc-300">
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Session</th>
                <th className="px-2 py-2">Session key</th>
                <th className="px-2 py-2">Replay</th>
                <th className="px-2 py-2">Car telemetry</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.sessionKey} className="border-b border-white/10">
                  <td className="px-2 py-2">
                    <p className="font-semibold">
                      {session.year} R{session.round}
                    </p>
                    <p className="text-zinc-300">{session.meeting.meeting_name}</p>
                  </td>
                  <td className="px-2 py-2">{session.session.session_name}</td>
                  <td className="px-2 py-2 text-zinc-300">{session.sessionKey}</td>
                  <td className="px-2 py-2 text-emerald-200">Ready</td>
                  <td className="px-2 py-2">
                    <span
                      className={
                        session.status.car === "ready" ? "text-emerald-200" : "text-zinc-400"
                      }
                    >
                      {session.status.car === "ready" ? "Ready" : "Unavailable"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {catalog && sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">No sessions published yet.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
};
