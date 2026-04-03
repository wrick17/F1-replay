import { useEffect, useState } from "react";
import type { ReplayRouteParams } from "../../../app/routing";
import { getReplayEventDetails } from "../services/eventDetails.service";
import type { ReplayEventDetails } from "../types/home.types";

type ReplayEventDetailsState = {
  data: ReplayEventDetails | null;
  loading: boolean;
  error: string | null;
};

export const useReplayEventDetails = (route: ReplayRouteParams | null): ReplayEventDetailsState => {
  const [state, setState] = useState<ReplayEventDetailsState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!route) {
      setState({ data: null, loading: false, error: "Invalid event URL." });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const load = async () => {
      try {
        const details = await getReplayEventDetails(route);
        if (!cancelled) {
          if (!details) {
            setState({ data: null, loading: false, error: "Replay details not found." });
            return;
          }
          setState({ data: details, loading: false, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load event details",
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [route]);

  return state;
};
