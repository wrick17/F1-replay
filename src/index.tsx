import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { resolveAppRoute } from "./app/routing";
import "react-tippy/dist/tippy.css";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

const route = resolveAppRoute(window.location.pathname, window.location.search);

const HomePage = lazy(() =>
  import("./modules/home/pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const EventDetailsPage = lazy(() =>
  import("./modules/home/pages/EventDetailsPage").then((m) => ({ default: m.EventDetailsPage })),
);
const OpsCacheDashboardPage = lazy(() =>
  import("./modules/ops/pages/OpsCacheDashboardPage").then((m) => ({
    default: m.OpsCacheDashboardPage,
  })),
);
const ReplayLegacyRedirectPage = lazy(() =>
  import("./modules/replay/pages/ReplayLegacyRedirectPage").then((m) => ({
    default: m.ReplayLegacyRedirectPage,
  })),
);
const ReplayRoutePage = lazy(() =>
  import("./modules/replay/pages/ReplayRoutePage").then((m) => ({ default: m.ReplayRoutePage })),
);

createRoot(container).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <main className="p-8">
          <output>Loading F1 Replay…</output>
        </main>
      }
    >
      {route === "replay" ? (
        <ReplayRoutePage />
      ) : route === "legacy-replay-redirect" ? (
        <ReplayLegacyRedirectPage />
      ) : route === "event-details" ? (
        <EventDetailsPage />
      ) : route === "ops-cache" ? (
        <OpsCacheDashboardPage />
      ) : (
        <HomePage />
      )}
    </Suspense>
  </React.StrictMode>,
);
