import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchChunked,
  fetchOpenF1,
  fetchReplayFromWorker,
  uploadReplayToWorker,
} from "../api/openf1.client";
import {
  buildYearOptions,
  chunkAppend,
  createTelemetryMap,
  filterEndedMeetings,
  getLatestTelemetryTimestamp,
} from "../services/telemetry.service";
import type {
  OpenF1Driver,
  OpenF1Lap,
  OpenF1Location,
  OpenF1Meeting,
  OpenF1Overtake,
  OpenF1Pit,
  OpenF1Position,
  OpenF1RaceControl,
  OpenF1Session,
  OpenF1Stint,
  OpenF1TeamRadio,
  OpenF1Weather,
  ReplaySessionData,
  TimedSample,
} from "../types/openf1.types";
import type { SessionType } from "../types/replay.types";
import { groupByDriverNumber, sortByTimestamp, withTimestamp } from "../utils/telemetry.util";

type ReplayDataState = {
  data: ReplaySessionData | null;
  loading: boolean;
  error: string | null;
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
  availableYears: number[];
  availableEndMs: number;
  dataRevision: number;
};

type ReplayDataParams = {
  year: number;
  round: number;
  sessionType: SessionType;
};

export const useReplayData = ({ year, round, sessionType }: ReplayDataParams): ReplayDataState => {
  const [data, setData] = useState<ReplaySessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<OpenF1Meeting[]>([]);
  const [sessions, setSessions] = useState<OpenF1Session[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [availableEndMs, setAvailableEndMs] = useState(0);
  const [dataRevision, setDataRevision] = useState(0);
  const sessionCacheRef = useRef<Map<number, ReplaySessionData>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const meetingsRequestRef = useRef(0);
  const sessionsRequestRef = useRef(0);
  const yearOptions = useMemo(() => buildYearOptions(new Date().getFullYear()), []);

  const sortedMeetings = useMemo(() => {
    return [...meetings].sort(
      (a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
    );
  }, [meetings]);

  const selectedMeeting = sortedMeetings[round - 1] ?? sortedMeetings[0] ?? null;
  const selectedMeetingKey = selectedMeeting?.meeting_key ?? null;
  const selectedMeetingRef = useRef(selectedMeeting);
  selectedMeetingRef.current = selectedMeeting;

  useEffect(() => {
    const requestId = meetingsRequestRef.current + 1;
    meetingsRequestRef.current = requestId;
    setLoading(true);
    setError(null);
    setMeetings([]);
    setSessions([]);
    setData(null);
    setAvailableEndMs(0);
    setDataRevision(0);

    fetchOpenF1<OpenF1Meeting[]>("meetings", { year }, undefined, "persist")
      .then((result) => {
        if (meetingsRequestRef.current !== requestId) {
          return;
        }
        setMeetings(filterEndedMeetings(result, Date.now()));
      })
      .catch((err: Error) => {
        if (meetingsRequestRef.current !== requestId) {
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        if (meetingsRequestRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    const loadYears = async () => {
      const now = Date.now();
      const available: number[] = [];
      for (const option of yearOptions) {
        try {
          const result = await fetchOpenF1<OpenF1Meeting[]>(
            "meetings",
            { year: option },
            undefined,
            "persist",
          );
          if (cancelled) {
            return;
          }
          if (filterEndedMeetings(result, now).length > 0) {
            available.push(option);
          }
        } catch {
          if (cancelled) {
            return;
          }
        }
      }
      if (!cancelled) {
        setAvailableYears(available);
      }
    };
    void loadYears();
    return () => {
      cancelled = true;
    };
  }, [yearOptions]);

  useEffect(() => {
    if (!selectedMeetingKey) {
      return;
    }
    const requestId = sessionsRequestRef.current + 1;
    sessionsRequestRef.current = requestId;
    setLoading(true);
    setError(null);
    setSessions([]);
    setData(null);
    setAvailableEndMs(0);
    setDataRevision(0);

    fetchOpenF1<OpenF1Session[]>(
      "sessions",
      { meeting_key: selectedMeetingKey },
      undefined,
      "persist",
    )
      .then((result) => {
        if (sessionsRequestRef.current !== requestId) {
          return;
        }
        const now = Date.now();
        const filtered = result.filter((session) => {
          const endMs = new Date(session.date_end).getTime();
          return endMs <= now;
        });
        setSessions(filtered);
      })
      .catch((err: Error) => {
        if (sessionsRequestRef.current !== requestId) {
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        if (sessionsRequestRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [selectedMeetingKey]);

  useEffect(() => {
    const meeting = selectedMeetingRef.current;
    if (!meeting) {
      return;
    }
    const session = sessions.find((entry) => entry.session_type === sessionType) ?? null;
    if (!session) {
      setLoading(false);
      setData(null);
      return;
    }
    const cached = sessionCacheRef.current.get(session.session_key);
    if (cached) {
      setData(cached);
      setAvailableEndMs(getLatestTelemetryTimestamp(cached.telemetryByDriver));
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setData(null);
    setAvailableEndMs(0);
    setDataRevision(0);

    const load = async () => {
      const cached = await fetchReplayFromWorker(session.session_key, controller.signal);
      if (cached.status === "hit") {
        sessionCacheRef.current.set(session.session_key, cached.payload);
        const latest = getLatestTelemetryTimestamp(cached.payload.telemetryByDriver);
        if (!controller.signal.aborted) {
          setAvailableEndMs(latest > 0 ? latest : cached.payload.sessionEndMs);
        }
        return cached.payload;
      }

      const drivers = await fetchOpenF1<OpenF1Driver[]>(
        "drivers",
        { session_key: session.session_key },
        controller.signal,
        "persist",
      );
      const telemetryByDriver = createTelemetryMap(drivers);

      const sessionStartMs = new Date(session.date_start).getTime();
      const sessionEndMs = new Date(session.date_end).getTime();

      const [stints, laps, teamRadios, overtakes, weather, raceControl, pits] = await Promise.all([
        fetchOpenF1<OpenF1Stint[]>(
          "stints",
          { session_key: session.session_key },
          controller.signal,
          "persist",
        ),
        fetchOpenF1<OpenF1Lap[]>(
          "laps",
          { session_key: session.session_key },
          controller.signal,
          "persist",
        ),
        fetchOpenF1<OpenF1TeamRadio[]>(
          "team_radio",
          { session_key: session.session_key },
          controller.signal,
          "persist",
        ),
        fetchOpenF1<OpenF1Overtake[]>(
          "overtakes",
          { session_key: session.session_key },
          controller.signal,
          "persist",
        ),
        fetchOpenF1<OpenF1Weather[]>(
          "weather",
          { session_key: session.session_key },
          controller.signal,
          "persist",
        ),
        fetchOpenF1<OpenF1RaceControl[]>(
          "race_control",
          { session_key: session.session_key },
          controller.signal,
          "persist",
        ),
        fetchOpenF1<OpenF1Pit[]>(
          "pit",
          { session_key: session.session_key },
          controller.signal,
          "persist",
        ),
      ]);
      const lapsTimed = withTimestamp(laps);
      const lapsGrouped = groupByDriverNumber(lapsTimed);

      Object.entries(lapsGrouped).forEach(([driverKey, driverLaps]) => {
        const driverNumber = Number(driverKey);
        if (!telemetryByDriver[driverNumber]) {
          telemetryByDriver[driverNumber] = {
            locations: [],
            positions: [],
            stints: [],
            laps: [],
          };
        }
        telemetryByDriver[driverNumber].laps = sortByTimestamp(driverLaps);
      });

      const stintsGrouped = groupByDriverNumber(stints);
      Object.entries(stintsGrouped).forEach(([driverKey, driverStints]) => {
        const driverNumber = Number(driverKey);
        if (!telemetryByDriver[driverNumber]) {
          telemetryByDriver[driverNumber] = {
            locations: [],
            positions: [],
            stints: [],
            laps: [],
          };
        }
        telemetryByDriver[driverNumber].stints = driverStints;
      });

      const baseData = {
        meeting: meeting,
        session,
        drivers,
        telemetryByDriver,
        sessionStartMs,
        sessionEndMs,
        teamRadios: withTimestamp(teamRadios),
        overtakes: withTimestamp(overtakes),
        weather: withTimestamp(weather),
        raceControl: withTimestamp(raceControl),
        pits: withTimestamp(pits),
      } satisfies ReplaySessionData;
      if (!controller.signal.aborted) {
        setData(baseData);
      }

      const handleLocationsChunk = (chunk: OpenF1Location[]) => {
        const normalized = sortByTimestamp(withTimestamp(chunk)).filter(
          (sample) =>
            Number.isFinite(sample.x) &&
            Number.isFinite(sample.y) &&
            Number.isFinite(sample.z) &&
            Number.isFinite(sample.timestampMs),
        );
        chunkAppend(
          Object.fromEntries(
            Object.keys(telemetryByDriver).map((key) => [
              Number(key),
              telemetryByDriver[Number(key)].locations,
            ]),
          ),
          normalized,
        );
        const latestTimestamp = normalized[normalized.length - 1]?.timestampMs ?? 0;
        if (latestTimestamp > 0) {
          setAvailableEndMs((prev) => Math.max(prev, latestTimestamp));
        }
        setDataRevision((prev) => prev + 1);
      };

      const handlePositionChunk = (chunk: OpenF1Position[]) => {
        const normalized = sortByTimestamp(withTimestamp(chunk));
        chunkAppend(
          Object.fromEntries(
            Object.keys(telemetryByDriver).map((key) => [
              Number(key),
              telemetryByDriver[Number(key)].positions,
            ]),
          ),
          normalized,
        );
        setDataRevision((prev) => prev + 1);
      };

      const positionStartMs = Math.max(0, sessionStartMs - 60 * 60 * 1000);
      await Promise.all([
        fetchChunked<OpenF1Location>(
          "location",
          { session_key: session.session_key },
          sessionStartMs,
          sessionEndMs,
          180_000,
          handleLocationsChunk,
          controller.signal,
          "persist",
        ),
        fetchChunked<OpenF1Position>(
          "position",
          { session_key: session.session_key },
          positionStartMs,
          sessionEndMs,
          600_000,
          handlePositionChunk,
          controller.signal,
          "persist",
        ),
      ]);

      Object.values(telemetryByDriver).forEach((telemetry) => {
        telemetry.locations = sortByTimestamp(telemetry.locations as TimedSample<OpenF1Location>[]);
        telemetry.positions = sortByTimestamp(telemetry.positions as TimedSample<OpenF1Position>[]);
      });

      sessionCacheRef.current.set(session.session_key, baseData);
      // Upload even if the effect is later cleaned up: the payload is already fully built
      // at this point, and skipping the upload prevents cache warming.
      void uploadReplayToWorker(session.session_key, baseData, cached.uploadToken).catch(
        () => undefined,
      );
      return baseData;
    };

    load()
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
        }
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [sessions, sessionType]);

  return {
    data,
    loading,
    error,
    meetings: sortedMeetings,
    sessions,
    availableYears,
    availableEndMs,
    dataRevision,
  };
};
