import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
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

export const useSessionState = (): UseSessionStateResult => {
  const search = useSearch({ from: "/replay" });
  const navigate = useNavigate();
  const manualRoundRef = useRef(false);

  const defaultYear = getDefaultYear();
  const year = typeof search.year === "number" ? search.year : defaultYear;
  const round = typeof search.round === "number" ? search.round : 1;
  const sessionType = isValidSessionType(search.session) ? search.session : "Race";

  const setYear = useCallback(
    (nextYear: number) => {
      navigate({
        to: "/replay",
        search: (prev) => ({ ...prev, year: nextYear, round: 1 }),
        replace: true,
      });
    },
    [navigate],
  );

  const setRound = useCallback(
    (nextRound: number | ((prev: number) => number)) => {
      navigate({
        to: "/replay",
        search: (prev) => {
          const resolved =
            typeof nextRound === "function"
              ? nextRound(typeof prev.round === "number" ? prev.round : 1)
              : nextRound;
          return { ...prev, round: resolved };
        },
        replace: true,
      });
    },
    [navigate],
  );

  const setSessionType = useCallback(
    (nextSessionType: SessionType) => {
      navigate({
        to: "/replay",
        search: (prev) => ({ ...prev, session: nextSessionType }),
        replace: true,
      });
    },
    [navigate],
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
