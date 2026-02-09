import { useCallback, useRef, useState } from "react";
import { SKIP_INTERVAL_OPTIONS, SPEED_OPTIONS } from "../constants/replay.constants";

const STORAGE_KEY = "f1-replay-prefs";

type UserPreferences = {
  speed: number;
  skipIntervalMs: number;
  radioEnabled: boolean;
  timelineExpanded: boolean;
};

const DEFAULTS: UserPreferences = {
  speed: 1,
  skipIntervalMs: 10_000,
  radioEnabled: true,
  timelineExpanded: false,
};

const loadPrefs = (): UserPreferences => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
};

const persistPrefs = (prefs: UserPreferences) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable in some environments
  }
};

export const useUserPreferences = () => {
  const [prefs, setPrefs] = useState<UserPreferences>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const update = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      prefsRef.current = next;
      persistPrefs(next);
      return next;
    });
  }, []);

  const setSpeed = useCallback((speed: number) => update({ speed }), [update]);

  const cycleSpeed = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(prefsRef.current.speed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    update({ speed: SPEED_OPTIONS[nextIndex] });
  }, [update]);

  const setSkipIntervalMs = useCallback(
    (skipIntervalMs: number) => update({ skipIntervalMs }),
    [update],
  );

  const cycleSkipInterval = useCallback(() => {
    const options = SKIP_INTERVAL_OPTIONS as readonly number[];
    const currentIndex = options.indexOf(prefsRef.current.skipIntervalMs);
    const nextIndex = (currentIndex + 1) % options.length;
    update({ skipIntervalMs: options[nextIndex] });
  }, [update]);

  const toggleRadio = useCallback(
    () => update({ radioEnabled: !prefsRef.current.radioEnabled }),
    [update],
  );

  const toggleTimelineExpanded = useCallback(
    () => update({ timelineExpanded: !prefsRef.current.timelineExpanded }),
    [update],
  );

  return {
    speed: prefs.speed,
    skipIntervalMs: prefs.skipIntervalMs,
    radioEnabled: prefs.radioEnabled,
    timelineExpanded: prefs.timelineExpanded,
    setSpeed,
    cycleSpeed,
    setSkipIntervalMs,
    cycleSkipInterval,
    toggleRadio,
    toggleTimelineExpanded,
  };
};
