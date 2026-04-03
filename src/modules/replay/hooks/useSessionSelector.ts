import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildReplayHref, getReplayRouteParams, readLegacyReplayRoute } from "../../../app/routing";
import { ALLOWED_SESSION_TYPES } from "../constants/replay.constants";
import type { OpenF1Meeting, OpenF1Session } from "../types/openf1.types";
import type { SessionType } from "../types/replay.types";

export const getAvailableSessionTypes = (sessions: OpenF1Session[]): SessionType[] => {
  const sessionSet = new Set(sessions.map((session) => session.session_type));
  return ALLOWED_SESSION_TYPES.filter((sessionType) => sessionSet.has(sessionType));
};

export const getFallbackSessionType = (sessions: OpenF1Session[]): SessionType | null =>
  getAvailableSessionTypes(sessions)[0] ?? null;

export const getCorrectedYear = (
  availableYears: number[],
  year: number | null,
  hasExplicitYear: boolean,
): number | null => {
  if (availableYears.length === 0) {
    return null;
  }
  if (!hasExplicitYear || year === null) {
    return availableYears[0] ?? null;
  }
  if (availableYears.includes(year)) {
    return null;
  }
  return availableYears[0] ?? null;
};

type UseSessionAutoCorrectParams = {
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
  availableYears: number[];
  year: number | null;
  hasExplicitYear: boolean;
  round: number;
  sessionType: SessionType;
  setYear: (year: number) => void;
  setRound: (round: number | ((prev: number) => number)) => void;
  setSessionType: (sessionType: SessionType) => void;
  manualRoundRef: React.RefObject<boolean>;
};

export const useSessionAutoCorrect = ({
  meetings,
  sessions,
  availableYears,
  year,
  hasExplicitYear,
  round,
  sessionType,
  setYear,
  setRound,
  setSessionType,
  manualRoundRef,
}: UseSessionAutoCorrectParams) => {
  const hasSupportedSession = useMemo(() => {
    return getAvailableSessionTypes(sessions).length > 0;
  }, [sessions]);

  const hasSelectedSession = useMemo(() => {
    return sessions.some((session) => session.session_type === sessionType);
  }, [sessions, sessionType]);

  useEffect(() => {
    if (sessions.length === 0 || hasSelectedSession) {
      return;
    }
    const fallback = getFallbackSessionType(sessions);
    if (fallback) {
      setSessionType(fallback);
    }
  }, [sessions, hasSelectedSession, setSessionType]);

  useEffect(() => {
    const nextYear = getCorrectedYear(availableYears, year, hasExplicitYear);
    if (nextYear !== null && nextYear !== year) {
      setYear(nextYear);
      setRound(1);
      manualRoundRef.current = false;
    }
  }, [availableYears, year, hasExplicitYear, setYear, setRound, manualRoundRef]);

  useEffect(() => {
    if (manualRoundRef.current) {
      return;
    }
    if (sessions.length === 0 || hasSupportedSession) {
      return;
    }
    if (round < meetings.length) {
      setRound((prev: number) => Math.min(prev + 1, meetings.length));
    }
  }, [sessions, hasSupportedSession, meetings.length, round, setRound, manualRoundRef]);

  return { hasSupportedSession, hasSelectedSession };
};

export const isValidSessionType = (value: unknown): value is SessionType =>
  value === "Race" || value === "Qualifying" || value === "Sprint";

type UseSessionStateResult = {
  year: number | null;
  hasExplicitYear: boolean;
  round: number;
  sessionType: SessionType;
  manualRoundRef: React.RefObject<boolean>;
  setYear: (year: number) => void;
  setRound: (round: number | ((prev: number) => number)) => void;
  setSessionType: (sessionType: SessionType) => void;
};

type SessionSearchState = {
  year?: number;
  round?: number;
  session?: string;
};

export const buildReplayRouteUrl = (nextState: SessionSearchState, hash: string): string => {
  if (
    typeof nextState.year === "number" &&
    typeof nextState.round === "number" &&
    isValidSessionType(nextState.session)
  ) {
    return `${buildReplayHref(nextState.year, nextState.round, nextState.session)}${hash}`;
  }
  return `/replay${hash}`;
};

const parseNumberParam = (value: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readSearchState = (): SessionSearchState => {
  const pathParams = getReplayRouteParams(window.location.pathname);
  if (pathParams) {
    return {
      year: pathParams.year,
      round: pathParams.round,
      session: pathParams.sessionType,
    };
  }

  const legacy = readLegacyReplayRoute(window.location.search);
  if (legacy) {
    return {
      year: legacy.year,
      round: legacy.round,
      session: legacy.sessionType,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    year: parseNumberParam(params.get("year")),
    round: parseNumberParam(params.get("round")),
    session: params.get("session") ?? undefined,
  };
};

const writeSearchState = (nextState: SessionSearchState): void => {
  const nextUrl = buildReplayRouteUrl(nextState, window.location.hash);
  window.history.replaceState({}, "", nextUrl);
};

export const useSessionState = (): UseSessionStateResult => {
  const [search, setSearch] = useState<SessionSearchState>(() => readSearchState());
  const manualRoundRef = useRef(false);

  useEffect(() => {
    const syncFromLocation = () => {
      setSearch(readSearchState());
    };
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  const updateSearch = useCallback((updater: (prev: SessionSearchState) => SessionSearchState) => {
    setSearch((prev) => {
      const next = updater(prev);
      writeSearchState(next);
      return next;
    });
  }, []);

  const hasExplicitYear = typeof search.year === "number";
  const year = hasExplicitYear ? (search.year ?? null) : null;
  const round = typeof search.round === "number" ? search.round : 1;
  const sessionType = isValidSessionType(search.session) ? search.session : "Race";

  const setYear = useCallback(
    (nextYear: number) => {
      updateSearch((prev) => ({ ...prev, year: nextYear, round: 1 }));
    },
    [updateSearch],
  );

  const setRound = useCallback(
    (nextRound: number | ((prev: number) => number)) => {
      updateSearch((prev) => {
        const resolved =
          typeof nextRound === "function"
            ? nextRound(typeof prev.round === "number" ? prev.round : 1)
            : nextRound;
        return { ...prev, round: resolved };
      });
    },
    [updateSearch],
  );

  const setSessionType = useCallback(
    (nextSessionType: SessionType) => {
      updateSearch((prev) => ({ ...prev, session: nextSessionType }));
    },
    [updateSearch],
  );

  return {
    year,
    hasExplicitYear,
    round,
    sessionType,
    manualRoundRef,
    setYear,
    setRound,
    setSessionType,
  };
};
