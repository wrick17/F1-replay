import { useCallback, useEffect, useRef, useState } from "react";

export type ReplayController = {
  currentTimeMs: number;
  isPlaying: boolean;
  isBuffering: boolean;
  speed: number;
  setSpeed: (value: number) => void;
  togglePlay: () => void;
  seekTo: (timestampMs: number) => void;
};

type ReplayControllerOptions = {
  startTimeMs: number;
  endTimeMs: number;
  loadedStartMs: number;
  loadedEndMs: number;
};

export const isReplayTimeLoaded = (
  timestampMs: number,
  loadedStartMs: number,
  loadedEndMs: number,
) => loadedEndMs > loadedStartMs && timestampMs >= loadedStartMs && timestampMs <= loadedEndMs;

export const useReplayController = ({
  startTimeMs,
  endTimeMs,
  loadedStartMs,
  loadedEndMs,
}: ReplayControllerOptions): ReplayController => {
  const [currentTimeMs, setCurrentTimeMs] = useState(startTimeMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const resumeWhenLoadedRef = useRef(false);
  const currentTimeMsRef = useRef(currentTimeMs);
  currentTimeMsRef.current = currentTimeMs;

  const speedRef = useRef(speed);
  speedRef.current = speed;
  const endTimeMsRef = useRef(endTimeMs);
  endTimeMsRef.current = endTimeMs;
  const loadedStartMsRef = useRef(loadedStartMs);
  loadedStartMsRef.current = loadedStartMs;
  const loadedEndMsRef = useRef(loadedEndMs);
  loadedEndMsRef.current = loadedEndMs;

  const cancelFrame = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastFrameRef.current = null;
  }, []);

  const stop = useCallback(() => {
    resumeWhenLoadedRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    cancelFrame();
  }, [cancelFrame]);

  const tick = useCallback(
    (timestamp: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const delta = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;
      const next = currentTimeMsRef.current + delta * speedRef.current;
      if (next >= endTimeMsRef.current) {
        setCurrentTimeMs(endTimeMsRef.current);
        stop();
        return;
      }
      if (!isReplayTimeLoaded(next, loadedStartMsRef.current, loadedEndMsRef.current)) {
        setCurrentTimeMs(next);
        resumeWhenLoadedRef.current = true;
        setIsBuffering(true);
        setIsPlaying(false);
        cancelFrame();
        return;
      }
      setCurrentTimeMs(next);
      rafRef.current = requestAnimationFrame(tick);
    },
    [cancelFrame, stop],
  );

  useEffect(() => {
    if (!isPlaying) {
      cancelFrame();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return cancelFrame;
  }, [cancelFrame, isPlaying, tick]);

  useEffect(() => {
    if (!isBuffering || !isReplayTimeLoaded(currentTimeMs, loadedStartMs, loadedEndMs)) return;
    setIsBuffering(false);
    if (resumeWhenLoadedRef.current) {
      resumeWhenLoadedRef.current = false;
      setIsPlaying(true);
    }
  }, [currentTimeMs, isBuffering, loadedEndMs, loadedStartMs]);

  useEffect(() => {
    setCurrentTimeMs(startTimeMs);
    stop();
  }, [startTimeMs, stop]);

  const togglePlay = useCallback(() => {
    if (isBuffering) {
      resumeWhenLoadedRef.current = false;
      setIsBuffering(false);
      return;
    }
    if (isPlaying) {
      resumeWhenLoadedRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      return;
    }
    if (!isReplayTimeLoaded(currentTimeMs, loadedStartMs, loadedEndMs)) {
      resumeWhenLoadedRef.current = true;
      setIsBuffering(true);
      return;
    }
    setIsBuffering(false);
    setIsPlaying(true);
  }, [currentTimeMs, isBuffering, isPlaying, loadedEndMs, loadedStartMs]);

  const seekTo = useCallback(
    (timestampMs: number) => {
      const clamped = Math.min(Math.max(timestampMs, startTimeMs), endTimeMs);
      const wasPlaying = isPlaying;
      setCurrentTimeMs(clamped);
      if (!isReplayTimeLoaded(clamped, loadedStartMs, loadedEndMs)) {
        resumeWhenLoadedRef.current = wasPlaying;
        setIsPlaying(false);
        setIsBuffering(true);
      } else {
        resumeWhenLoadedRef.current = false;
        setIsBuffering(false);
      }
    },
    [endTimeMs, isPlaying, loadedEndMs, loadedStartMs, startTimeMs],
  );

  return { currentTimeMs, isPlaying, isBuffering, speed, setSpeed, togglePlay, seekTo };
};
