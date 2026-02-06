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
  availableEndMs: number;
};

export const useReplayController = ({
  startTimeMs,
  endTimeMs,
  availableEndMs,
}: ReplayControllerOptions): ReplayController => {
  const [currentTimeMs, setCurrentTimeMs] = useState(startTimeMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const speedRef = useRef(speed);
  speedRef.current = speed;
  const endTimeMsRef = useRef(endTimeMs);
  endTimeMsRef.current = endTimeMs;
  const availableEndMsRef = useRef(availableEndMs);
  availableEndMsRef.current = availableEndMs;

  const stop = useCallback(() => {
    setIsPlaying(false);
    setIsBuffering(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(
    (timestamp: number) => {
      if (!lastFrameRef.current) {
        lastFrameRef.current = timestamp;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const delta = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;
      setCurrentTimeMs((prev) => {
        const next = prev + delta * speedRef.current;
        if (next >= endTimeMsRef.current) {
          stop();
          return endTimeMsRef.current;
        }
        if (next >= availableEndMsRef.current) {
          setIsBuffering(true);
          setIsPlaying(false);
          return availableEndMsRef.current;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    },
    [stop],
  );

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      lastFrameRef.current = null;
    };
  }, [isPlaying, tick]);

  useEffect(() => {
    if (isBuffering && currentTimeMs < availableEndMs - 1000) {
      setIsBuffering(false);
      setIsPlaying(true);
    }
  }, [availableEndMs, currentTimeMs, isBuffering]);

  useEffect(() => {
    setCurrentTimeMs(startTimeMs);
    stop();
  }, [startTimeMs, stop]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
    setIsBuffering(false);
  };

  const seekTo = (timestampMs: number) => {
    const clamped = Math.min(Math.max(timestampMs, startTimeMs), endTimeMs);
    setCurrentTimeMs(clamped);
  };

  return {
    currentTimeMs,
    isPlaying,
    isBuffering,
    speed,
    setSpeed,
    togglePlay,
    seekTo,
  };
};
