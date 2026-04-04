import { useEffect, useMemo, useState } from "react";
import { HOME_PATH, OPS_CACHE_PATH, REPLAY_PATH } from "../../../app/routing";
import { useHomeDashboard } from "../hooks/useHomeDashboard";
import type { HomeRaceCard } from "../types/home.types";

const currentYear = new Date().getFullYear();
const seasonYears = Array.from({ length: currentYear - 2019 }, (_, index) => currentYear - index);

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

const compactDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const toDateLabel = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "TBD";
  }
  return dateFormatter.format(parsed);
};

const toCompactDateTimeLabel = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "TBD";
  }
  return compactDateTimeFormatter.format(parsed);
};

export const toCountdown = (value: string, nowMs = Date.now()) => {
  const target = Date.parse(value);
  if (!Number.isFinite(target)) {
    return "Time TBD";
  }
  const diff = target - nowMs;
  if (diff <= 0) {
    return "Session started";
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return `${days}d ${hours}h ${minutes}m`;
};

const renderReplayAction = (card: HomeRaceCard) => {
  if (card.replay.detailsHref) {
    return (
      <a
        href={card.replay.detailsHref}
        className="inline-flex items-center rounded-full border border-red-300/50 bg-red-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-100 transition hover:bg-red-500/30"
      >
        Details
      </a>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-500/50 bg-zinc-700/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-200">
      Replay Pending
    </span>
  );
};

const toInitials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part.trim()[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const toDriverFallbackImage = (name: string) =>
  svgDataUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
      <rect width='96' height='96' rx='48' fill='#27272a'/>
      <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='#f4f4f5' font-family='Arial, sans-serif' font-size='32' font-weight='700'>${toInitials(
        name,
      )}</text>
    </svg>`,
  );

const toTeamFallbackLogo = (team: string) =>
  svgDataUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
      <rect width='96' height='96' rx='18' fill='#18181b'/>
      <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='#f4f4f5' font-family='Arial, sans-serif' font-size='30' font-weight='700'>${toInitials(
        team,
      )}</text>
    </svg>`,
  );

export const HomePage = () => {
  const [year, setYear] = useState(currentYear);
  const { data, loading, error } = useHomeDashboard(year);
  const [selectedUpcomingRaceId, setSelectedUpcomingRaceId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = globalThis.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, []);

  const selectedUpcomingRace = useMemo(() => {
    if (!data || !selectedUpcomingRaceId) {
      return data?.nextRace ?? null;
    }
    return (
      data.upcomingCards.find((card) => card.id === selectedUpcomingRaceId) ?? data.nextRace ?? null
    );
  }, [data, selectedUpcomingRaceId]);

  return (
    <div className="home-shell min-h-screen px-4 pb-16 pt-5 text-white md:px-8">
      <header className="mx-auto flex w-full max-w-350 flex-col gap-4 rounded-2xl border border-white/15 bg-black/35 px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <a href={HOME_PATH} className="inline-flex items-center">
            <img src="/logo.png" alt="F1 Replay" className="h-6 w-auto" />
          </a>
          <p className="text-[11px] uppercase tracking-[0.22em] text-red-200/80">
            Replay Control Center
          </p>
          <h1 className="home-display text-3xl font-bold tracking-[0.04em] text-white md:text-4xl">
            F1 Replay Hub
          </h1>
          <p className="text-sm text-zinc-300">
            Race intelligence home. Jump into replays fast, with standings and live-season context.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="text-[11px] uppercase tracking-[0.18em] text-zinc-300"
            htmlFor="season-year"
          >
            Season
          </label>
          <select
            id="season-year"
            className="rounded-lg border border-white/20 bg-black/50 px-3 py-2 text-sm"
            value={year}
            onChange={(event) => {
              setYear(Number(event.target.value));
              setSelectedUpcomingRaceId(null);
            }}
          >
            {seasonYears.map((season) => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>
          <a
            href={REPLAY_PATH}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/15"
          >
            Open Replay
          </a>
          <a
            href={OPS_CACHE_PATH}
            className="rounded-lg border border-red-300/40 bg-red-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/30"
          >
            Cache Ops
          </a>
        </div>
      </header>

      <main className="mx-auto mt-6 grid w-full max-w-350 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-red-300/20 bg-linear-to-br from-red-950/50 via-black/70 to-black/80 p-4">
          {loading && <p className="text-sm text-zinc-300">Loading season dashboard...</p>}
          {error && <p className="text-sm text-red-200">{error}</p>}
          {!loading && !error && data && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-white/15 bg-black/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-300">
                    Latest Replay
                  </p>
                  {data.latestReplayRace ? (
                    <>
                      <h2 className="mt-2 text-2xl font-semibold">
                        {data.latestReplayRace.meetingName}
                      </h2>
                      <p className="text-sm text-zinc-300">
                        Round {data.latestReplayRace.round} · {data.latestReplayRace.circuitName}
                      </p>
                      <p className="mt-3 text-xs uppercase tracking-[0.14em] text-zinc-300">
                        {toDateLabel(data.latestReplayRace.startTime)}
                      </p>
                      <div className="mt-4">{renderReplayAction(data.latestReplayRace)}</div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-300">
                      No replayable race found for this season yet.
                    </p>
                  )}
                </article>

                <article className="rounded-xl border border-white/15 bg-black/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-300">
                    Next Session
                  </p>
                  {selectedUpcomingRace ? (
                    <>
                      <h2 className="mt-2 text-2xl font-semibold">
                        {selectedUpcomingRace.meetingName}
                      </h2>
                      <p className="text-sm text-zinc-300">
                        {selectedUpcomingRace.locality}, {selectedUpcomingRace.country}
                      </p>
                      <p className="mt-3 text-xs uppercase tracking-[0.14em] text-zinc-300">
                        Countdown: {toCountdown(selectedUpcomingRace.startTime, nowMs)}
                      </p>
                      <p className="mt-2 text-xs text-zinc-200">
                        {toDateLabel(selectedUpcomingRace.startTime)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-300">Season complete.</p>
                  )}
                </article>
              </div>

              <article
                id="replay-races"
                className="mt-4 rounded-xl border border-white/15 bg-black/30 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                    Replay Races
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {data.totalReplaySessions} sessions · {data.replaySessionsByYear.length} years
                  </p>
                </div>
                <div className="mt-3 max-h-[36rem] space-y-3 overflow-auto pr-1">
                  {data.replaySessionsByYear.map((group) => (
                    <article
                      key={group.year}
                      className="rounded-lg border border-white/10 bg-black/35"
                    >
                      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                        <h4 className="text-sm font-semibold text-white">{group.year}</h4>
                        <p className="text-[11px] text-zinc-400">
                          {group.sessions.length} sessions
                        </p>
                      </div>
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                            <th className="px-3 py-2 font-medium">Round</th>
                            <th className="px-3 py-2 font-medium">Session</th>
                            <th className="px-3 py-2 font-medium">Grand Prix</th>
                            <th className="px-3 py-2 font-medium">Circuit</th>
                            <th className="px-3 py-2 font-medium">Date</th>
                            <th className="px-3 py-2 text-right font-medium">Replay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.sessions.map((session) => (
                            <tr
                              key={session.id}
                              className="border-b border-white/5 text-[12px] text-zinc-200"
                            >
                              <td className="px-3 py-2 align-middle font-semibold text-zinc-100">
                                {session.round}
                              </td>
                              <td className="px-3 py-2 align-middle uppercase tracking-[0.06em] text-zinc-300">
                                {session.sessionType}
                              </td>
                              <td className="px-3 py-2 align-middle font-medium text-white">
                                {session.meetingName}
                              </td>
                              <td className="px-3 py-2 align-middle text-zinc-300">
                                {session.circuitName}
                              </td>
                              <td className="px-3 py-2 align-middle text-zinc-300">
                                {shortDateFormatter.format(Date.parse(session.startTime))}
                              </td>
                              <td className="px-3 py-2 text-right align-middle">
                                <a
                                  href={session.detailsHref}
                                  className="inline-flex items-center rounded-md border border-red-300/50 bg-red-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/30"
                                >
                                  Details
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </article>
                  ))}
                  {!data.replaySessionsByYear.length && (
                    <p className="text-sm text-zinc-300">
                      No replay sessions found yet across available seasons.
                    </p>
                  )}
                </div>
              </article>

              <article className="mt-4 rounded-xl border border-white/15 bg-black/30 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                    Upcoming Weekends
                  </h3>
                  <p className="text-xs text-zinc-400">{data.upcomingCards.length} upcoming</p>
                </div>
                <div className="mt-3 max-h-[28rem] overflow-auto pr-1">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                        <th className="px-3 py-2 font-medium">Round</th>
                        <th className="px-3 py-2 font-medium">Grand Prix</th>
                        <th className="px-3 py-2 font-medium">Circuit</th>
                        <th className="px-3 py-2 font-medium">Locality</th>
                        <th className="px-3 py-2 font-medium">Start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.upcomingCards.map((card) => {
                        const isSelected = selectedUpcomingRace?.id === card.id;
                        return (
                          <tr
                            key={card.id}
                            onClick={() => setSelectedUpcomingRaceId(card.id)}
                            className={`border-b border-white/5 text-[12px] text-zinc-200 transition ${
                              isSelected ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                          >
                            <td className="px-3 py-2 align-middle font-semibold text-zinc-100">
                              {card.round}
                            </td>
                            <td className="px-3 py-2 align-middle font-medium text-white">
                              {card.meetingName}
                            </td>
                            <td className="px-3 py-2 align-middle text-zinc-300">
                              {card.circuitName}
                            </td>
                            <td className="px-3 py-2 align-middle text-zinc-300">
                              {card.locality}, {card.country}
                            </td>
                            <td className="px-3 py-2 align-middle text-zinc-300">
                              <span className="whitespace-nowrap">
                                {toCompactDateTimeLabel(card.startTime)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            </>
          )}
        </section>

        <section className="grid gap-5">
          <article className="rounded-2xl border border-white/15 bg-black/40 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
              Driver Standings
            </h3>
            {data?.standingsContextLabel && (
              <p className="mt-1 text-xs text-zinc-400">{data.standingsContextLabel}</p>
            )}
            <div className="mt-3 space-y-2">
              {(data?.driverStandings ?? []).slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/35 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    {entry.imageUrl ? (
                      <img
                        src={entry.imageUrl}
                        alt={entry.name}
                        className="h-9 w-9 rounded-full border border-white/20 object-cover"
                        loading="lazy"
                        onError={(event) => {
                          const fallback = toDriverFallbackImage(entry.name);
                          if (event.currentTarget.src !== fallback) {
                            event.currentTarget.src = fallback;
                          }
                        }}
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-semibold text-zinc-200">
                        {toInitials(entry.name)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">
                        P{entry.position} · {entry.name}
                      </p>
                      <div className="flex items-center gap-2">
                        {entry.teamLogoUrl && (
                          <img
                            src={entry.teamLogoUrl}
                            alt={`${entry.team} logo`}
                            className="h-4 w-4 rounded-full object-cover"
                            loading="lazy"
                            onError={(event) => {
                              const fallback = toTeamFallbackLogo(entry.team);
                              if (event.currentTarget.src !== fallback) {
                                event.currentTarget.src = fallback;
                              }
                            }}
                          />
                        )}
                        <p className="text-xs text-zinc-400">{entry.team}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-red-100">{entry.points} pts</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-white/15 bg-black/40 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
              Constructor Standings
            </h3>
            {data?.standingsContextLabel && (
              <p className="mt-1 text-xs text-zinc-400">{data.standingsContextLabel}</p>
            )}
            <div className="mt-3 space-y-2">
              {(data?.constructorStandings ?? []).slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/35 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {entry.logoUrl && (
                      <img
                        src={entry.logoUrl}
                        alt={`${entry.name} logo`}
                        className="h-5 w-5 rounded-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          const fallback = toTeamFallbackLogo(entry.name);
                          if (event.currentTarget.src !== fallback) {
                            event.currentTarget.src = fallback;
                          }
                        }}
                      />
                    )}
                    <p className="text-sm font-semibold text-white">
                      P{entry.position} · {entry.name}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-red-100">{entry.points} pts</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-white/15 bg-black/40 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
              Newsroom
            </h3>
            <div className="mt-3 space-y-3">
              {(data?.news ?? []).slice(0, 6).map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-white/10 bg-black/35 p-3 transition hover:border-red-300/40 hover:bg-black/55"
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                    {item.source}
                  </p>
                  <h4 className="mt-1 text-sm font-semibold text-white">{item.title}</h4>
                </a>
              ))}
              {!data?.news.length && !loading && (
                <p className="text-sm text-zinc-300">News feed is currently unavailable.</p>
              )}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
};
