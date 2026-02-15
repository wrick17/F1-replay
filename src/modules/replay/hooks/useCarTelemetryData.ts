import { useEffect, useRef, useState } from "react";
import {
  fetchCarTelemetryFromWorker,
  uploadCarTelemetryToWorker,
} from "../api/carTelemetry.client";
import { fetchChunked } from "../api/openf1.client";
import {
  createDownsampleState,
  finalizeCarTelemetryPayload,
  ingestCarDataChunk,
} from "../services/carTelemetry.service";
import type { CarTelemetryPayload } from "../types/carTelemetry.types";
import type { OpenF1CarData } from "../types/openf1.types";

type CarTelemetryState = {
  payload: CarTelemetryPayload | null;
  loading: boolean;
  error: string | null;
};

type Params = {
  enabled: boolean;
  sessionKey: number | null;
  sessionStartMs: number;
  sessionEndMs: number;
};

// Car telemetry is high-volume; use larger OpenF1 windows to reduce request count / 429s.
const CAR_DATA_WINDOW_MS = 600_000;

export const useCarTelemetryData = ({
  enabled,
  sessionKey,
  sessionStartMs,
  sessionEndMs,
}: Params): CarTelemetryState => {
  const [payload, setPayload] = useState<CarTelemetryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<number, CarTelemetryPayload>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !sessionKey || sessionEndMs <= sessionStartMs) {
      abortRef.current?.abort();
      setLoading(false);
      setError(null);
      setPayload(null);
      return;
    }

    const cached = cacheRef.current.get(sessionKey);
    if (cached) {
      setPayload(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setPayload(null);

    const load = async () => {
      const cached = await fetchCarTelemetryFromWorker(sessionKey, controller.signal);
      if (cached.status === "hit") {
        cacheRef.current.set(sessionKey, cached.payload);
        return cached.payload;
      }

      const state = createDownsampleState(sessionKey, 500);
      await fetchChunked<OpenF1CarData>(
        "car_data",
        { session_key: sessionKey },
        sessionStartMs,
        sessionEndMs,
        CAR_DATA_WINDOW_MS,
        (chunk) => {
          ingestCarDataChunk(state, chunk);
        },
        controller.signal,
        "persist",
      );

      const built = finalizeCarTelemetryPayload(state);
      cacheRef.current.set(sessionKey, built);

      // Upload even if the hook unmounts after build, to help warm the worker cache.
      void uploadCarTelemetryToWorker(sessionKey, built, cached.uploadToken).catch(() => undefined);

      return built;
    };

    load()
      .then((result) => {
        if (!controller.signal.aborted) {
          setPayload(result);
        }
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [enabled, sessionKey, sessionStartMs, sessionEndMs]);

  return { payload, loading, error };
};
