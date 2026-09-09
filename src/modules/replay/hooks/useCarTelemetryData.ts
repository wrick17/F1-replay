import { useEffect, useMemo, useRef, useState } from "react";
import { findChunkAt, getArchiveCatalogUrl, loadCarChunk } from "../../archive";
import type { ArchiveManifest } from "../../archive/types";
import type { CarTelemetryPayload } from "../types/carTelemetry.types";
import { getReplayWindowIndexes } from "./useReplayData";

export type CarTelemetryState = {
  payload: CarTelemetryPayload | null;
  loading: boolean;
  error: string | null;
};

type Params = {
  enabled: boolean;
  manifest: ArchiveManifest | null;
  currentTimeMs: number;
};

const buildPayload = (
  manifest: ArchiveManifest,
  chunks: Map<number, CarTelemetryPayload["byDriver"]>,
  indexes: number[],
): CarTelemetryPayload => {
  const byDriver: CarTelemetryPayload["byDriver"] = {};
  for (const index of indexes) {
    for (const [driver, samples] of Object.entries(chunks.get(index) ?? {})) {
      const driverNumber = Number(driver);
      const existing = byDriver[driverNumber] ?? [];
      existing.push(...samples);
      byDriver[driverNumber] = existing;
    }
  }
  for (const [driver, samples] of Object.entries(byDriver)) {
    const byTimestamp = new Map(samples.map((sample) => [sample.timestampMs, sample]));
    byDriver[Number(driver)] = [...byTimestamp.values()].sort(
      (a, b) => a.timestampMs - b.timestampMs,
    );
  }
  return {
    sessionKey: manifest.sessionKey,
    sampleIntervalMs: manifest.car?.sampleIntervalMs ?? 500,
    createdAt: manifest.car?.createdAt ?? "",
    byDriver,
  };
};

export const useCarTelemetryData = ({
  enabled,
  manifest,
  currentTimeMs,
}: Params): CarTelemetryState => {
  const [payload, setPayload] = useState<CarTelemetryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chunksRef = useRef<Map<number, CarTelemetryPayload["byDriver"]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const sessionKeyRef = useRef<number | null>(null);
  const selectedIndex = useMemo(() => {
    if (!enabled || !manifest?.car) return -1;
    const descriptor = findChunkAt(manifest.car.chunks, currentTimeMs);
    return descriptor ? manifest.car.chunks.indexOf(descriptor) : -1;
  }, [currentTimeMs, enabled, manifest]);

  useEffect(() => {
    abortRef.current?.abort();
    if (!enabled || !manifest?.car || selectedIndex < 0) {
      chunksRef.current.clear();
      setPayload(null);
      setLoading(false);
      setError(null);
      return;
    }
    const car = manifest.car;

    if (sessionKeyRef.current !== manifest.sessionKey) {
      chunksRef.current.clear();
      sessionKeyRef.current = manifest.sessionKey;
      setPayload(null);
    }

    const desired = getReplayWindowIndexes(selectedIndex, manifest.car.chunks.length);
    for (const index of [...chunksRef.current.keys()]) {
      if (!desired.includes(index)) chunksRef.current.delete(index);
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();
    abortRef.current = controller;
    setPayload(
      chunksRef.current.has(selectedIndex)
        ? buildPayload(manifest, chunksRef.current, desired)
        : null,
    );
    setLoading(true);
    setError(null);

    const commit = () => setPayload(buildPayload(manifest, chunksRef.current, desired));
    const load = async () => {
      if (!chunksRef.current.has(selectedIndex)) {
        const selectedChunk = await loadCarChunk(
          getArchiveCatalogUrl(),
          manifest,
          car.chunks[selectedIndex],
          { signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          requestRef.current !== requestId ||
          sessionKeyRef.current !== manifest.sessionKey
        ) {
          return;
        }
        chunksRef.current.set(selectedIndex, selectedChunk);
      }
      if (controller.signal.aborted || requestRef.current !== requestId) return;
      commit();
      await Promise.all(
        desired
          .filter((index) => index !== selectedIndex && !chunksRef.current.has(index))
          .map(async (index) => {
            const chunk = await loadCarChunk(getArchiveCatalogUrl(), manifest, car.chunks[index], {
              signal: controller.signal,
            });
            if (!controller.signal.aborted && requestRef.current === requestId) {
              chunksRef.current.set(index, chunk);
            }
          }),
      );
      if (!controller.signal.aborted && requestRef.current === requestId) commit();
    };

    void load()
      .catch((loadError) => {
        if (!controller.signal.aborted && requestRef.current === requestId) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load car telemetry");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && requestRef.current === requestId) setLoading(false);
      });

    return () => controller.abort();
  }, [enabled, manifest, selectedIndex]);

  return {
    payload: payload?.sessionKey === manifest?.sessionKey ? payload : null,
    loading,
    error,
  };
};
