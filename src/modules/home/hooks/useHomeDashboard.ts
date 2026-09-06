import { useEffect, useState } from "react";
import { loadArchiveDashboard, loadDashboardSupplement } from "../services/homeData.service";
import type { HomeDashboardData } from "../types/home.types";

export const useHomeDashboard = (year: number) => {
  const [data, setData] = useState<HomeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    const load = async () => {
      try {
        const result = await loadArchiveDashboard(year, controller.signal);
        if (controller.signal.aborted) return;
        setData(result.data);
        setLoading(false);
        try {
          const supplemented = await loadDashboardSupplement(
            result.catalog,
            result.data,
            controller.signal,
          );
          if (!controller.signal.aborted) setData(supplemented);
        } catch (supplementError) {
          if (!controller.signal.aborted) {
            setData({
              ...result.data,
              warnings: [
                supplementError instanceof Error
                  ? supplementError.message
                  : "Season context unavailable",
              ],
            });
          }
        }
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load home data");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      controller.abort();
    };
  }, [year]);

  return { data, loading, error };
};
