import React from "react";
import { createRoot } from "react-dom/client";
import { resolveAppRoute } from "./app/routing";
import { EventDetailsPage, HomePage } from "./modules/home";
import { OpsCacheDashboardPage } from "./modules/ops";
import { ReplayLegacyRedirectPage, ReplayRoutePage } from "./modules/replay";
import "react-tippy/dist/tippy.css";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

const route = resolveAppRoute(window.location.pathname, window.location.search);

createRoot(container).render(
  <React.StrictMode>
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
  </React.StrictMode>,
);
