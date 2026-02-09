import { useEffect, useRef } from "react";

type KeyboardShortcutActions = {
  togglePlay: () => void;
  seekTo: (timestampMs: number) => void;
  currentTimeMs: number;
  skipIntervalMs: number;
  cycleSpeed: () => void;
  toggleRadio: () => void;
  cycleSkipInterval: () => void;
  toggleTimelineExpanded: () => void;
  nextRound: () => void;
  prevRound: () => void;
  nextYear: () => void;
  prevYear: () => void;
  nextSession: () => void;
  prevSession: () => void;
};

const IGNORED_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export const useKeyboardShortcuts = (actions: KeyboardShortcutActions) => {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && IGNORED_TAG_NAMES.has(target.tagName)) return;

      const a = actionsRef.current;
      const isArrowUp = e.key === "ArrowUp";
      const isArrowDown = e.key === "ArrowDown";

      if (isArrowUp || isArrowDown) {
        const isSessionCombo = e.shiftKey && (e.ctrlKey || e.metaKey);
        const isYearCombo = e.shiftKey && !e.ctrlKey && !e.metaKey;
        if (isSessionCombo) {
          e.preventDefault();
          if (isArrowUp) {
            a.nextSession();
          } else {
            a.prevSession();
          }
          return;
        }
        if (isYearCombo) {
          e.preventDefault();
          if (isArrowUp) {
            a.nextYear();
          } else {
            a.prevYear();
          }
          return;
        }
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          if (isArrowUp) {
            a.prevRound();
          } else {
            a.nextRound();
          }
        }
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          a.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          a.seekTo(a.currentTimeMs - a.skipIntervalMs);
          break;
        case "ArrowRight":
          e.preventDefault();
          a.seekTo(a.currentTimeMs + a.skipIntervalMs);
          break;
        case "s":
        case "S":
          a.cycleSpeed();
          break;
        case "m":
        case "M":
          a.toggleRadio();
          break;
        case "i":
        case "I":
          a.cycleSkipInterval();
          break;
        case "e":
        case "E":
          a.toggleTimelineExpanded();
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
};
