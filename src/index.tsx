import React from "react";
import { createRoot } from "react-dom/client";
import { ReplayPage } from "./modules/replay";
import "react-tippy/dist/tippy.css";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

if (window.location.pathname === "/replay") {
  window.history.replaceState({}, "", `/${window.location.search}${window.location.hash}`);
}

createRoot(container).render(
  <React.StrictMode>
    <ReplayPage />
  </React.StrictMode>,
);
