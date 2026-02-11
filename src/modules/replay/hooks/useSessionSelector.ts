import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALLOWED_SESSION_TYPES, getDefaultYear } from "../constants/replay.constants";
import type { OpenF1Meeting, OpenF1Session } from "../types/openf1.types";
import type { SessionType } from "../types/replay.types";

type UseSessionAutoCorrectParams = {
  meetings: OpenF1Meeting[];
  sessions: OpenF1Session[];
  availableYears: number[];
  year: number;
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
  round,
  sessionType,
  setYear,
  setRound,
  setSessionType,
  manualRoundRef,
}: UseSessionAutoCorrectParams) => {
  const hasSupportedSession = useMemo(() => {
    return sessions.some((session) =>
      ALLOWED_SESSION_TYPES.includes(
        session.session_type as (typeof ALLOWED_SESSION_TYPES)[number],
      ),
    );
  }, [sessions]);

  const hasSelectedSession = useMemo(() => {
    return sessions.some((session) => session.session_type === sessionType);
  }, [sessions, sessionType]);

  useEffect(() => {
    if (sessions.length === 0 || hasSelectedSession) {
      return;
    }
    const fallback = sessions.find((session) =>
      ALLOWED_SESSION_TYPES.includes(
        session.session_type as (typeof ALLOWED_SESSION_TYPES)[number],
      ),
    );
    if (fallback) {
      setSessionType(fallback.session_type as SessionType);
    }
  }, [sessions, hasSelectedSession, setSessionType]);

  useEffect(() => {
    if (availableYears.length === 0) {
      return;
    }
    if (!availableYears.includes(year)) {
      const nextYear = availableYears[0];
      if (nextYear !== year) {
        setYear(nextYear);
        setRound(1);
        manualRoundRef.current = false;
      }
    }
  }, [availableYears, year, setYear, setRound, manualRoundRef]);

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

const isValidSessionType = (value: unknown): value is SessionType =>
  value === "Race" || value === "Sprint" || value === "Qualifying";

type UseSessionStateResult = {
  year: number;
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

const parseNumberParam = (value: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readSearchState = (): SessionSearchState => {
  const params = new URLSearchParams(window.location.search);
  return {
    year: parseNumberParam(params.get("year")),
    round: parseNumberParam(params.get("round")),
    session: params.get("session") ?? undefined,
  };
};

const writeSearchState = (nextState: SessionSearchState): void => {
  const params = new URLSearchParams(window.location.search);
  if (typeof nextState.year === "number") {
    params.set("year", String(nextState.year));
  } else {
    params.delete("year");
  }
  if (typeof nextState.round === "number") {
    params.set("round", String(nextState.round));
  } else {
    params.delete("round");
  }
  if (typeof nextState.session === "string") {
    params.set("session", nextState.session);
  } else {
    params.delete("session");
  }
  const query = params.toString();
  const nextUrl = query ? `/?${query}${window.location.hash}` : `/${window.location.hash}`;
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

  const defaultYear = getDefaultYear();
  const year = typeof search.year === "number" ? search.year : defaultYear;
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
    round,
    sessionType,
    manualRoundRef,
    setYear,
    setRound,
    setSessionType,
  };
};
