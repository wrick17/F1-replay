import { useMemo } from "react";
import { getEventRouteParams, HOME_PATH } from "../../../app/routing";
import { useReplayEventDetails } from "../hooks/useReplayEventDetails";
import type { ReplayEventResultRow } from "../types/home.types";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
});

const toDateLabel = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "TBD";
  }
  return dateFormatter.format(parsed);
};

const toShortDateLabel = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "TBD";
  }
  return shortDateFormatter.format(parsed);
};

const toLapLabel = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "-";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}:${remainingSeconds.toFixed(3).padStart(6, "0")}`;
};

const toFixedLabel = (value: number | null, digits = 3) => {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(digits);
};

const toIntegerLabel = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  return `${Math.round(value)}`;
};

const isQualifyingRow = (row: ReplayEventResultRow) =>
  row.q1 !== null || row.q2 !== null || row.q3 !== null;

const sessionPillClassMap = {
  Race: "border-red-300/45 bg-red-500/20 text-red-100",
  Sprint: "border-amber-300/45 bg-amber-500/20 text-amber-100",
  Qualifying: "border-sky-300/45 bg-sky-500/20 text-sky-100",
} as const;

const compoundPillClassMap: Record<string, string> = {
  SOFT: "border-red-300/45 bg-red-500/20 text-red-100",
  MEDIUM: "border-amber-300/45 bg-amber-500/20 text-amber-100",
  HARD: "border-zinc-300/45 bg-zinc-500/20 text-zinc-100",
  INTERMEDIATE: "border-emerald-300/45 bg-emerald-500/20 text-emerald-100",
  WET: "border-blue-300/45 bg-blue-500/20 text-blue-100",
};

const BasePill = ({ label, className }: { label: string; className: string }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}
  >
    {label}
  </span>
);

const SessionPill = ({ sessionType }: { sessionType: "Race" | "Sprint" | "Qualifying" }) => (
  <BasePill label={sessionType} className={sessionPillClassMap[sessionType]} />
);

const StatPill = ({ label }: { label: string }) => (
  <BasePill label={label} className="border-violet-300/35 bg-violet-500/20 text-violet-100" />
);

const SubtlePill = ({ label }: { label: string }) => (
  <BasePill label={label} className="border-white/20 bg-white/5 text-zinc-100" />
);

const StatusPill = ({ status }: { status: string }) => (
  <BasePill label={status} className="border-orange-300/35 bg-orange-500/20 text-orange-100" />
);

const CompoundPill = ({ label }: { label: string }) => {
  const compound = label.split(":")[0]?.trim().toUpperCase() ?? "";
  const className =
    compoundPillClassMap[compound] ?? "border-cyan-300/35 bg-cyan-500/20 text-cyan-100";
  return <BasePill label={label} className={className} />;
};

const DriverCell = ({ driver, driverImageUrl }: { driver: string; driverImageUrl: string }) => (
  <div className="flex items-center gap-2">
    <img
      src={driverImageUrl}
      alt={`${driver} headshot`}
      loading="lazy"
      className="h-6 w-6 rounded-full border border-white/20 object-cover"
    />
    <span>{driver}</span>
  </div>
);

const TeamCell = ({ team, teamLogoUrl }: { team: string; teamLogoUrl: string }) => (
  <div className="flex items-center gap-2">
    <img
      src={teamLogoUrl}
      alt={`${team} logo`}
      loading="lazy"
      className="h-5 w-5 rounded-sm border border-white/15 object-contain bg-black/20 p-[1px]"
    />
    <span>{team}</span>
  </div>
);

export const EventDetailsPage = () => {
  const route = useMemo(() => getEventRouteParams(window.location.pathname), []);
  const { data, loading, error } = useReplayEventDetails(route);

  return (
    <main className="home-shell min-h-screen px-4 pb-16 pt-6 text-white md:px-8">
      <div className="mx-auto w-full max-w-350 rounded-2xl border border-white/15 bg-black/35 p-5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={HOME_PATH}
            className="inline-flex items-center rounded-md border border-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
          >
            Back Home
          </a>
          <a
            href={`${HOME_PATH}#replay-races`}
            className="inline-flex items-center rounded-md border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white/10"
          >
            Replay Races
          </a>
        </div>

        {loading && (
          <output className="mt-6 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-zinc-200">
            Loading event details...
          </output>
        )}

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-400/30 bg-red-900/25 px-4 py-3 text-sm text-red-100"
          >
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="mt-6 space-y-5">
            <section className="rounded-xl border border-red-300/20 bg-gradient-to-br from-red-950/50 via-black/70 to-black/80 p-5">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-300">
                    Event Details
                  </p>
                  <h1 className="mt-2 text-3xl font-bold text-white">{data.meetingName}</h1>
                  {data.officialMeetingName && (
                    <p className="mt-1 text-sm text-zinc-300">{data.officialMeetingName}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={data.replayHref}
                    className="inline-flex items-center rounded-md border border-red-300/50 bg-red-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-100 transition hover:bg-red-500/30"
                  >
                    Watch Replay
                  </a>
                </div>
              </div>

              <dl className="mt-5 grid gap-3 text-sm text-zinc-200 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">Round</dt>
                  <dd className="mt-1 font-semibold text-white">{data.round}</dd>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">Session</dt>
                  <dd className="mt-1">
                    <SessionPill sessionType={data.sessionType} />
                  </dd>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">Circuit</dt>
                  <dd className="mt-1 font-semibold text-white">{data.circuitName}</dd>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">
                    Location
                  </dt>
                  <dd className="mt-1 font-semibold text-white">
                    {data.locality ? `${data.locality}, ${data.country}` : data.country}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-white/15 bg-black/30 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                Weekend Sessions
              </h2>
              <div className="mt-3 overflow-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Start</th>
                      <th className="px-3 py-2">End</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weekendSessions.map((session) => (
                      <tr key={session.id} className="border-b border-white/5 text-zinc-200">
                        <td className="px-3 py-2 font-semibold text-white">
                          <SessionPill sessionType={session.sessionType} />
                        </td>
                        <td className="px-3 py-2">{toDateLabel(session.startTime)}</td>
                        <td className="px-3 py-2">{toDateLabel(session.endTime)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-2">
                            <a
                              href={session.detailsHref}
                              className="rounded border border-white/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-100 transition hover:bg-white/10"
                            >
                              Details
                            </a>
                            <a
                              href={session.replayHref}
                              className="rounded border border-red-300/40 bg-red-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-100 transition hover:bg-red-500/30"
                            >
                              Replay
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-white/15 bg-black/30 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                Sessions Analysis
              </h2>
              <div className="mt-4 space-y-4">
                {data.sessionResults.map((section) => {
                  const qualifying = section.rows.some(isQualifyingRow);
                  return (
                    <article
                      key={section.sessionType}
                      className="rounded-lg border border-white/10 bg-black/35 p-3"
                    >
                      <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <SessionPill sessionType={section.sessionType} />
                        <SubtlePill label={`${section.rows.length} rows`} />
                      </div>
                      <div className="mt-2 overflow-auto">
                        <table className="w-full border-collapse text-left text-[12px]">
                          <thead>
                            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                              <th className="px-2 py-2">Pos</th>
                              <th className="px-2 py-2">Driver</th>
                              <th className="px-2 py-2">Team</th>
                              {qualifying ? (
                                <>
                                  <th className="px-2 py-2">Q1</th>
                                  <th className="px-2 py-2">Q2</th>
                                  <th className="px-2 py-2">Q3</th>
                                </>
                              ) : (
                                <>
                                  <th className="px-2 py-2">Start</th>
                                  <th className="px-2 py-2">Pts</th>
                                  <th className="px-2 py-2">Laps</th>
                                  <th className="px-2 py-2">Time / Status</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row, index) => (
                              <tr
                                key={`${section.sessionType}-${row.driver}-${index}`}
                                className="border-b border-white/5 text-zinc-200"
                              >
                                <td className="px-2 py-2 font-semibold text-white">
                                  {row.position !== null ? (
                                    <StatPill label={`P${row.position}`} />
                                  ) : (
                                    "-"
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <DriverCell
                                    driver={row.driver}
                                    driverImageUrl={row.driverImageUrl}
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <TeamCell team={row.team} teamLogoUrl={row.teamLogoUrl} />
                                </td>
                                {qualifying ? (
                                  <>
                                    <td className="px-2 py-2">{row.q1 ?? "-"}</td>
                                    <td className="px-2 py-2">{row.q2 ?? "-"}</td>
                                    <td className="px-2 py-2">{row.q3 ?? "-"}</td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-2 py-2">{row.grid ?? "-"}</td>
                                    <td className="px-2 py-2">{row.points ?? "-"}</td>
                                    <td className="px-2 py-2">
                                      {row.laps !== null ? (
                                        <SubtlePill label={`${row.laps} laps`} />
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td className="px-2 py-2">
                                      {row.time ? (
                                        row.time
                                      ) : row.status ? (
                                        <StatusPill status={row.status} />
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
                {!data.sessionResults.length && (
                  <p className="text-sm text-zinc-300">
                    No session result data available for this event.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-white/15 bg-black/30 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                Stints
              </h2>
              <div className="mt-3 overflow-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                      <th className="px-2 py-2">Driver</th>
                      <th className="px-2 py-2">Team</th>
                      <th className="px-2 py-2">Stints</th>
                      <th className="px-2 py-2 whitespace-nowrap">
                        <span className="sm:hidden">Laps</span>
                        <span className="hidden sm:inline">Total Laps</span>
                      </th>
                      <th className="px-2 py-2">Compounds / Ranges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stints.map((stint) => (
                      <tr
                        key={stint.driverNumber}
                        className="border-b border-white/5 text-zinc-200"
                      >
                        <td className="px-2 py-2 font-semibold text-white">
                          <DriverCell driver={stint.driver} driverImageUrl={stint.driverImageUrl} />
                        </td>
                        <td className="px-2 py-2">
                          <TeamCell team={stint.team} teamLogoUrl={stint.teamLogoUrl} />
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-semibold text-white">{stint.stintCount}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-semibold text-white">{stint.totalLaps}</span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {stint.stintLabels.map((label) => (
                              <CompoundPill key={`${stint.driverNumber}-${label}`} label={label} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.stints.length === 0 && (
                  <p className="py-3 text-sm text-zinc-300">No stint data available.</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-white/15 bg-black/30 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                Lap & Sector Metrics
              </h2>
              <div className="mt-3 overflow-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                      <th className="px-2 py-2">Driver</th>
                      <th className="px-2 py-2">Team</th>
                      <th className="px-2 py-2">Avg Lap</th>
                      <th className="px-2 py-2">Best Lap</th>
                      <th className="px-2 py-2">S1 Avg</th>
                      <th className="px-2 py-2">S2 Avg</th>
                      <th className="px-2 py-2">S3 Avg</th>
                      <th className="px-2 py-2">Avg Speed</th>
                      <th className="px-2 py-2">Peak Speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lapMetrics.map((metric) => (
                      <tr
                        key={metric.driverNumber}
                        className="border-b border-white/5 text-zinc-200"
                      >
                        <td className="px-2 py-2 font-semibold text-white">
                          <DriverCell
                            driver={metric.driver}
                            driverImageUrl={metric.driverImageUrl}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <TeamCell team={metric.team} teamLogoUrl={metric.teamLogoUrl} />
                        </td>
                        <td className="px-2 py-2">{toLapLabel(metric.averageLapSeconds)}</td>
                        <td className="px-2 py-2">{toLapLabel(metric.bestLapSeconds)}</td>
                        <td className="px-2 py-2">{toFixedLabel(metric.averageSector1Seconds)}</td>
                        <td className="px-2 py-2">{toFixedLabel(metric.averageSector2Seconds)}</td>
                        <td className="px-2 py-2">{toFixedLabel(metric.averageSector3Seconds)}</td>
                        <td className="px-2 py-2">
                          <SubtlePill label={`${toIntegerLabel(metric.averageSpeedKph)} km/h`} />
                        </td>
                        <td className="px-2 py-2">
                          <StatPill label={`${toIntegerLabel(metric.peakSpeedKph)} km/h`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.lapMetrics.length === 0 && (
                  <p className="py-3 text-sm text-zinc-300">No lap metrics available.</p>
                )}
              </div>
            </section>

            <p className="text-xs text-zinc-400">
              Reference date: {toShortDateLabel(data.startTime)}
            </p>
          </div>
        )}
      </div>
    </main>
  );
};
