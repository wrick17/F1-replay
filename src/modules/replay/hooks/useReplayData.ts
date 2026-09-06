import { useCallback, useEffect, useRef, useState } from "react";
import {
  findChunkAt,
  getArchiveCatalogUrl,
  loadCatalog,
  loadLocationChunk,
  loadManifest,
  loadReplayCore,
} from "../../archive";
import type {
  ArchiveCatalogSession,
  ArchiveChunk,
  ArchiveManifest,
  DecodedLocationChunk,
} from "../../archive/types";
import type {
  OpenF1Location,
  OpenF1Meeting,
  OpenF1Session,
  ReplaySessionData,
  TimedSample,
} from "../types/openf1.types";
import type { SessionType } from "../types/replay.types";

type LoadedLocationChunk = {
  index: number;
  locations: DecodedLocationChunk;
};

type ReplayWindowContext = {
  manifest: ArchiveManifest;
  core: ReplaySessionData;
  knownDrivers: ReadonlySet<number>;
  chunks: Map<number, DecodedLocationChunk>;
  targetIndex: number | null;
};

type ReplayDataState = {
  data: ReplaySessionData | null;
  loading: boolean;
  error: string | null;
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
  availableYears: number[];
  loadedStartMs: number;
  loadedEndMs: number;
  sessionEndMs: number;
  dataRevision: number;
  manifest: ArchiveManifest | null;
  requestWindow: (timestampMs: number) => Promise<void>;
};

type ReplayDataParams = {
  year: number | null;
  round: number;
  sessionType: SessionType;
};

const isSessionType = (value: string): value is SessionType =>
  value === "Race" || value === "Sprint" || value === "Qualifying";

export const getReplayWindowIndexes = (selectedIndex: number, chunkCount: number) =>
  [selectedIndex - 1, selectedIndex, selectedIndex + 1].filter(
    (index) => index >= 0 && index < chunkCount,
  );

export const getReplayChunkIndex = (chunks: ArchiveChunk[], timestampMs: number) => {
  const exact = findChunkAt(chunks, timestampMs);
  if (exact) return chunks.indexOf(exact);
  const next = chunks.findIndex((chunk) => chunk.startMs > timestampMs);
  return next >= 0 ? next : chunks.length - 1;
};

const dedupeLocations = (samples: TimedSample<OpenF1Location>[]) => {
  const byTimestamp = new Map<number, TimedSample<OpenF1Location>>();
  for (const sample of samples) byTimestamp.set(sample.timestampMs, sample);
  return [...byTimestamp.values()].sort((a, b) => a.timestampMs - b.timestampMs);
};

export const buildReplayWindowData = (
  core: ReplaySessionData,
  chunks: LoadedLocationChunk[],
): ReplaySessionData => {
  const telemetryByDriver = Object.fromEntries(
    Object.entries(core.telemetryByDriver).map(([driver, telemetry]) => [
      driver,
      { ...telemetry, locations: [] as TimedSample<OpenF1Location>[] },
    ]),
  );
  for (const { locations } of chunks.sort((a, b) => a.index - b.index)) {
    for (const [driver, samples] of Object.entries(locations)) {
      const telemetry = telemetryByDriver[Number(driver)];
      if (!telemetry) throw new Error(`location chunk has unknown driver ${driver}`);
      telemetry.locations.push(...samples);
    }
  }
  for (const telemetry of Object.values(telemetryByDriver)) {
    telemetry.locations = dedupeLocations(telemetry.locations);
  }
  return { ...core, telemetryByDriver };
};

const sessionsForYear = (catalogSessions: ArchiveCatalogSession[], year: number) =>
  catalogSessions.filter((entry) => entry.year === year && isSessionType(entry.type));

export const projectCatalogSession = (entry: ArchiveCatalogSession): OpenF1Session => ({
  ...entry.session,
  session_type: entry.type,
});

const meetingsForYear = (catalogSessions: ArchiveCatalogSession[], year: number) => {
  const byRound = new Map<number, OpenF1Meeting>();
  for (const entry of sessionsForYear(catalogSessions, year)) {
    if (!byRound.has(entry.round)) {
      byRound.set(entry.round, { ...entry.meeting, round: entry.round } as OpenF1Meeting);
    }
  }
  return [...byRound.entries()]
    .sort(([roundA], [roundB]) => roundA - roundB)
    .map(([, meeting]) => meeting);
};

export const useReplayData = ({ year, round, sessionType }: ReplayDataParams): ReplayDataState => {
  const [data, setData] = useState<ReplaySessionData | null>(null);
  const [loading, setLoading] = useState(year !== null);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<OpenF1Meeting[]>([]);
  const [sessions, setSessions] = useState<OpenF1Session[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loadedStartMs, setLoadedStartMs] = useState(0);
  const [loadedEndMs, setLoadedEndMs] = useState(0);
  const [sessionEndMs, setSessionEndMs] = useState(0);
  const [dataRevision, setDataRevision] = useState(0);
  const [manifest, setManifest] = useState<ArchiveManifest | null>(null);
  const contextRef = useRef<ReplayWindowContext | null>(null);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const windowAbortRef = useRef<AbortController | null>(null);
  const windowRequestRef = useRef(0);

  const commitWindow = useCallback((context: ReplayWindowContext, indexes: number[]) => {
    const loaded = indexes.flatMap((index) => {
      const locations = context.chunks.get(index);
      return locations ? [{ index, locations }] : [];
    });
    if (!loaded.length) return;
    const descriptors = loaded.map(({ index }) => context.manifest.locations[index]);
    const firstIndex = Math.min(...loaded.map(({ index }) => index));
    const lastIndex = Math.max(...loaded.map(({ index }) => index));
    setData(buildReplayWindowData(context.core, loaded));
    setLoadedStartMs(
      firstIndex === 0
        ? context.manifest.sessionStartMs
        : (context.manifest.locations[firstIndex - 1]?.endMs ??
            Math.min(...descriptors.map((chunk) => chunk.startMs))),
    );
    setLoadedEndMs(
      lastIndex === context.manifest.locations.length - 1
        ? context.manifest.sessionEndMs
        : (context.manifest.locations[lastIndex + 1]?.startMs ??
            Math.max(...descriptors.map((chunk) => chunk.endMs))),
    );
    setDataRevision((revision) => revision + 1);
  }, []);

  const requestWindow = useCallback(
    async (timestampMs: number) => {
      const context = contextRef.current;
      if (!context) return;
      const selectedIndex = getReplayChunkIndex(context.manifest.locations, timestampMs);
      if (selectedIndex < 0 || context.targetIndex === selectedIndex) return;

      context.targetIndex = selectedIndex;
      const desired = getReplayWindowIndexes(selectedIndex, context.manifest.locations.length);
      for (const index of [...context.chunks.keys()]) {
        if (!desired.includes(index)) context.chunks.delete(index);
      }

      const requestId = windowRequestRef.current + 1;
      windowRequestRef.current = requestId;
      windowAbortRef.current?.abort();
      const controller = new AbortController();
      windowAbortRef.current = controller;
      setError(null);

      try {
        if (!context.chunks.has(selectedIndex)) {
          const selectedChunk = await loadLocationChunk(
            getArchiveCatalogUrl(),
            context.manifest,
            context.manifest.locations[selectedIndex],
            context.knownDrivers,
            { signal: controller.signal },
          );
          if (controller.signal.aborted || windowRequestRef.current !== requestId) return;
          context.chunks.set(selectedIndex, selectedChunk);
        }
        if (controller.signal.aborted || windowRequestRef.current !== requestId) return;
        commitWindow(context, desired);

        await Promise.all(
          desired
            .filter((index) => index !== selectedIndex && !context.chunks.has(index))
            .map(async (index) => {
              const chunk = await loadLocationChunk(
                getArchiveCatalogUrl(),
                context.manifest,
                context.manifest.locations[index],
                context.knownDrivers,
                { signal: controller.signal },
              );
              if (!controller.signal.aborted && windowRequestRef.current === requestId) {
                context.chunks.set(index, chunk);
              }
            }),
        );
        if (controller.signal.aborted || windowRequestRef.current !== requestId) return;
        commitWindow(context, desired);
      } catch (loadError) {
        if (!controller.signal.aborted && windowRequestRef.current === requestId) {
          context.targetIndex = null;
          setError(loadError instanceof Error ? loadError.message : "Failed to load replay data");
        }
      }
    },
    [commitWindow],
  );

  useEffect(() => {
    sessionAbortRef.current?.abort();
    windowAbortRef.current?.abort();
    contextRef.current = null;
    setData(null);
    setManifest(null);
    setLoadedStartMs(0);
    setLoadedEndMs(0);
    setSessionEndMs(0);
    setDataRevision(0);
    setError(null);

    if (year === null) {
      setLoading(false);
      setMeetings([]);
      setSessions([]);
      return;
    }

    const controller = new AbortController();
    sessionAbortRef.current = controller;
    setLoading(true);

    const load = async () => {
      const catalog = await loadCatalog(getArchiveCatalogUrl(), { signal: controller.signal });
      if (controller.signal.aborted) return;
      setAvailableYears(
        [...new Set(catalog.sessions.map((entry) => entry.year))].sort((a, b) => b - a),
      );
      const yearSessions = sessionsForYear(catalog.sessions, year);
      const nextMeetings = meetingsForYear(catalog.sessions, year);
      const meetingEntry = yearSessions.find((entry) => entry.round === round) ?? null;
      const nextSessions = meetingEntry
        ? yearSessions
            .filter((entry) => entry.meetingKey === meetingEntry.meetingKey)
            .map(projectCatalogSession)
        : [];
      setMeetings(nextMeetings);
      setSessions(nextSessions);

      const selected = yearSessions.find(
        (entry) => entry.round === round && entry.type === sessionType,
      );
      if (!selected) return;
      const nextManifest = await loadManifest(getArchiveCatalogUrl(), selected, {
        signal: controller.signal,
      });
      if (!nextManifest.locations.length)
        throw new Error("This replay has no archived location data.");
      const core = await loadReplayCore(getArchiveCatalogUrl(), nextManifest, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const context: ReplayWindowContext = {
        manifest: nextManifest,
        core,
        knownDrivers: new Set(Object.keys(core.telemetryByDriver).map(Number)),
        chunks: new Map(),
        targetIndex: null,
      };
      contextRef.current = context;
      setManifest(nextManifest);
      setSessionEndMs(nextManifest.sessionEndMs);
      setData(core);
      await requestWindow(nextManifest.sessionStartMs);
    };

    void load()
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load replay data");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      windowAbortRef.current?.abort();
    };
  }, [year, round, sessionType, requestWindow]);

  return {
    data,
    loading,
    error,
    meetings,
    sessions,
    availableYears,
    loadedStartMs,
    loadedEndMs,
    sessionEndMs,
    dataRevision,
    manifest,
    requestWindow,
  };
};
