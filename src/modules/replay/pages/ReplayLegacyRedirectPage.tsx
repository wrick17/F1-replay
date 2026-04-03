import { useEffect, useState } from "react";
import { buildReplayHref, HOME_PATH, readLegacyReplayRoute } from "../../../app/routing";

export const ReplayLegacyRedirectPage = () => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const selection = readLegacyReplayRoute(window.location.search);
    if (!selection) {
      setError("Invalid replay URL. Please open a replay from Home.");
      return;
    }

    const nextHref = buildReplayHref(selection.year, selection.round, selection.sessionType);
    window.location.replace(nextHref);
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-white">
        <div className="rounded-xl border border-red-400/30 bg-red-900/25 px-5 py-3 text-sm tracking-wide backdrop-blur">
          <p>{error}</p>
          <a
            href={HOME_PATH}
            className="mt-3 inline-flex rounded-md border border-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
          >
            Back Home
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-white">
      <div className="rounded-xl border border-white/20 bg-black/45 px-5 py-3 text-sm tracking-wide backdrop-blur">
        Redirecting to replay...
      </div>
    </main>
  );
};
