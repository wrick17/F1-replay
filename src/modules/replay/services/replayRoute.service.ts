import { buildReplayHref } from "../../../app/routing";
import { getArchiveCatalogUrl, loadCatalog } from "../../archive";
import type { ArchiveCatalogSession } from "../../archive/types";
import type { OpenF1Session } from "../types/openf1.types";

const PREFERRED_SESSION_ORDER = ["Race", "Sprint", "Qualifying"] as const;

export type ReplayRouteSelection = {
  year: number;
  round: number;
  sessionType: (typeof PREFERRED_SESSION_ORDER)[number];
  href: string;
};

export const pickPreferredReplaySessionType = (sessions: OpenF1Session[]) => {
  for (const preferred of PREFERRED_SESSION_ORDER) {
    if (sessions.some((session) => session.session_type === preferred)) return preferred;
  }
  return null;
};

export const pickLatestCatalogReplay = (
  sessions: ArchiveCatalogSession[],
): ReplayRouteSelection | null => {
  const latest = [...sessions]
    .filter((entry) =>
      PREFERRED_SESSION_ORDER.includes(entry.type as ReplayRouteSelection["sessionType"]),
    )
    .sort((a, b) => {
      const dateDifference = Date.parse(b.session.date_end) - Date.parse(a.session.date_end);
      if (dateDifference !== 0) return dateDifference;
      return (
        PREFERRED_SESSION_ORDER.indexOf(a.type as ReplayRouteSelection["sessionType"]) -
        PREFERRED_SESSION_ORDER.indexOf(b.type as ReplayRouteSelection["sessionType"])
      );
    })[0];
  if (!latest) return null;
  const sessionType = latest.type as ReplayRouteSelection["sessionType"];
  return {
    year: latest.year,
    round: latest.round,
    sessionType,
    href: buildReplayHref(latest.year, latest.round, sessionType),
  };
};

export const resolveLatestReplaySelection = async (): Promise<ReplayRouteSelection | null> => {
  const catalog = await loadCatalog(getArchiveCatalogUrl());
  return pickLatestCatalogReplay(catalog.sessions);
};
