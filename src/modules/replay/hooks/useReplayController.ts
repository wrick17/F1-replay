import { useEffect, useRef, useState } from "react";

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

  const stop = () => {
    setIsPlaying(false);
    setIsBuffering(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const tick = (timestamp: number) => {
    if (!lastFrameRef.current) {
      lastFrameRef.current = timestamp;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const delta = timestamp - lastFrameRef.current;
    lastFrameRef.current = timestamp;
    setCurrentTimeMs((prev) => {
      const next = prev + delta * speed;
      if (next >= endTimeMs) {
        stop();
        return endTimeMs;
      }
      if (next >= availableEndMs) {
        setIsBuffering(true);
        setIsPlaying(false);
        return availableEndMs;
      }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  };

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
  }, [isPlaying, speed, endTimeMs, availableEndMs]);

  useEffect(() => {
    if (isBuffering && currentTimeMs < availableEndMs - 1000) {
      setIsBuffering(false);
      setIsPlaying(true);
    }
  }, [availableEndMs, currentTimeMs, isBuffering]);

  useEffect(() => {
    setCurrentTimeMs(startTimeMs);
    stop();
  }, [startTimeMs, endTimeMs]);

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
