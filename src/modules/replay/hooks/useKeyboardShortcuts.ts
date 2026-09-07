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

// Replay owns keyboard input, including when a native control has focus.
export const handleReplayShortcut = (e: KeyboardEvent, a: KeyboardShortcutActions) => {
  const arrowVertical = e.key === "ArrowUp" || e.key === "ArrowDown";
  const sessionCombo = arrowVertical && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey;
  // Keep browser/OS combinations, except the app's documented session shortcut.
  if ((e.ctrlKey || e.metaKey || e.altKey) && !sessionCombo) return;
  e.preventDefault();
  e.stopPropagation();
  if (arrowVertical) {
    if (sessionCombo) {
      if (e.key === "ArrowUp") a.nextSession();
      else a.prevSession();
    } else if (e.shiftKey) {
      if (e.key === "ArrowUp") a.nextYear();
      else a.prevYear();
    } else if (e.key === "ArrowUp") a.prevRound();
    else a.nextRound();
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    a.seekTo(a.currentTimeMs + (e.key === "ArrowLeft" ? -1 : 1) * a.skipIntervalMs);
    return;
  }
  if (e.repeat) return;
  switch (e.key.toLowerCase()) {
    case " ":
      a.togglePlay();
      break;
    case "s":
      a.cycleSpeed();
      break;
    case "m":
      a.toggleRadio();
      break;
    case "i":
      a.cycleSkipInterval();
      break;
    case "e":
      a.toggleTimelineExpanded();
      break;
    case "t":
      window.dispatchEvent(new Event("f1:toggle-telemetry"));
      break;
  }
};

export const useKeyboardShortcuts = (actions: KeyboardShortcutActions) => {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleReplayShortcut(e, actionsRef.current);
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);
};
