import { rootRoute } from "./__root";
import { indexRoute } from "./index";
import { replayRoute } from "./replay";

export const routeTree = rootRoute.addChildren([indexRoute, replayRoute]);
