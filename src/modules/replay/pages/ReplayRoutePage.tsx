import { useEffect, useState } from "react";
import { getReplayRouteParams } from "../../../app/routing";
import { resolveLatestReplaySelection } from "../services/replayRoute.service";
import { ReplayPage } from "./ReplayPage";

export const ReplayRoutePage = () => {
  const [ready, setReady] = useState(() => getReplayRouteParams(window.location.pathname) !== null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    if (ready) {
      return;
    }
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const selection = await resolveLatestReplaySelection();
        if (!cancelled) {
          if (!selection) {
            setBootstrapError("No archived replays are available yet.");
          } else {
            window.history.replaceState({}, "", selection.href);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setBootstrapError(error instanceof Error ? error.message : "Failed to load replay");
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-white">
        <output className="rounded-xl border border-white/20 bg-black/45 px-5 py-3 text-sm tracking-wide backdrop-blur">
          Finding the latest replay...
        </output>
      </main>
    );
  }

  if (bootstrapError) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-white">
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-900/25 px-5 py-3 text-sm tracking-wide backdrop-blur"
        >
          {bootstrapError}
        </div>
      </main>
    );
  }

  return <ReplayPage />;
};
