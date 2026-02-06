import { createRoute } from "@tanstack/react-router";
import { ReplayPage } from "modules/replay";
import { rootRoute } from "./__root";

type ReplaySearch = {
  year?: number;
  round?: number;
  session?: string;
};

export const replayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/replay",
  validateSearch: (search: Record<string, unknown>): ReplaySearch => ({
    year: typeof search.year === "number" ? search.year : undefined,
    round: typeof search.round === "number" ? search.round : undefined,
    session: typeof search.session === "string" ? search.session : undefined,
  }),
  component: ReplayPage,
});
