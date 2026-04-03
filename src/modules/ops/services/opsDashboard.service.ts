import type { DashboardSessionRow } from "../api/cacheWarmer.client";

export const normalizeText = (value: string) => value.trim().toLowerCase();

export const filterDashboardRows = (rows: DashboardSessionRow[], searchTerm: string) => {
  const search = normalizeText(searchTerm);
  if (!search) {
    return rows;
  }

  return rows.filter((row) => {
    const haystack = [
      String(row.year),
      `r${row.round}`,
      String(row.round),
      row.meeting_name ?? "",
      row.session_type,
      row.session_name ?? "",
      String(row.session_key),
      row.replay_status,
      row.telemetry_status,
      row.last_error ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
};

export const byNewestUpdate = (a: DashboardSessionRow, b: DashboardSessionRow) => {
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
};

const isCacheReady = (status: DashboardSessionRow["replay_status"]) =>
  status === "hit" || status === "warmed";

export const hasMissingCache = (row: DashboardSessionRow) =>
  !isCacheReady(row.replay_status) || !isCacheReady(row.telemetry_status);

export const shouldShowRowError = (row: DashboardSessionRow) =>
  hasMissingCache(row) && Boolean(row.last_error);

export const byMissingThenNewestUpdate = (a: DashboardSessionRow, b: DashboardSessionRow) => {
  const aMissing = hasMissingCache(a) ? 1 : 0;
  const bMissing = hasMissingCache(b) ? 1 : 0;
  if (aMissing !== bMissing) return bMissing - aMissing;
  return byNewestUpdate(a, b);
};
