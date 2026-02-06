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
