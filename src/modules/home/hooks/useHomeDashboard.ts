import { useEffect, useState } from "react";
import { getDashboardData } from "../services/homeData.service";
import type { HomeDashboardData } from "../types/home.types";

export const useHomeDashboard = (year: number) => {
  const [data, setData] = useState<HomeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const result = await getDashboardData(year);
        if (!cancelled) {
          setData(result);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load home data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  return { data, loading, error };
};
