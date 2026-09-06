import { useEffect, useState } from "react";
import type { ReplayRouteParams } from "../../../app/routing";
import {
  loadArchiveEventDetails,
  loadEventDetailsSupplement,
} from "../services/eventDetails.service";
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

    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });

    const load = async () => {
      try {
        const archive = await loadArchiveEventDetails(route, controller.signal);
        if (!controller.signal.aborted) {
          if (!archive) {
            setState({ data: null, loading: false, error: "Replay details not found." });
            return;
          }
          setState({ data: archive.data, loading: false, error: null });
          try {
            const supplemented = await loadEventDetailsSupplement(archive, controller.signal);
            if (!controller.signal.aborted) {
              setState({ data: supplemented, loading: false, error: null });
            }
          } catch {
            // Archive details remain useful when optional public result data fails.
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
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
      controller.abort();
    };
  }, [route]);

  return state;
};
