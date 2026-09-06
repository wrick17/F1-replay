import { loadCatalog } from "../../archive";
import type { ArchiveCatalog, ArchiveCatalogSession } from "../../archive/types";

const archiveBaseUrl =
  import.meta.env.RSBUILD_ARCHIVE_URL?.trim() || "https://data.f1.wrick17.com/";

export const ARCHIVE_CATALOG_URL = `${archiveBaseUrl.replace(/\/?$/, "/")}catalog.json`;
export const ARCHIVE_WORKFLOW_URL =
  "https://github.com/wrick17/F1-replay/actions/workflows/archive.yml";

export const loadArchiveCatalog = (signal?: AbortSignal) =>
  // Ops health must not report a stale local fallback as current.
  loadCatalog(ARCHIVE_CATALOG_URL, { signal, retries: 0, networkOnly: true });

export const summarizeArchive = (catalog: ArchiveCatalog) => ({
  seasons: new Set(catalog.sessions.map((session) => session.year)).size,
  meetings: new Set(catalog.sessions.map((session) => session.meetingKey)).size,
  sessions: catalog.sessions.length,
  carReady: catalog.sessions.filter((session) => session.status.car === "ready").length,
});

export const byNewestSession = (a: ArchiveCatalogSession, b: ArchiveCatalogSession) =>
  b.year - a.year ||
  b.round - a.round ||
  Date.parse(b.session.date_start) - Date.parse(a.session.date_start);
