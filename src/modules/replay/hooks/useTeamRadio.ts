import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenF1TeamRadio, TimedSample } from "../types/openf1.types";

type UseTeamRadioOptions = {
  teamRadios: TimedSample<OpenF1TeamRadio>[];
  currentTimeMs: number;
  enabled: boolean;
  isPlaying: boolean;
};

type UseTeamRadioResult = {
  currentRadio: TimedSample<OpenF1TeamRadio> | null;
  isAudioPlaying: boolean;
  playRadio: (radio: TimedSample<OpenF1TeamRadio>) => void;
  stopRadio: () => void;
  playbackError: boolean;
};

const RADIO_WINDOW_MS = 2000;

export const useTeamRadio = ({
  teamRadios,
  currentTimeMs,
  enabled,
  isPlaying,
}: UseTeamRadioOptions): UseTeamRadioResult => {
  const [currentRadio, setCurrentRadio] = useState<TimedSample<OpenF1TeamRadio> | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedSetRef = useRef(new Set<string>());
  const lastTimeMsRef = useRef(currentTimeMs);

  const stopRadio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setCurrentRadio(null);
    setIsAudioPlaying(false);
    setPlaybackError(false);
  }, []);

  const playRadio = useCallback(
    (radio: TimedSample<OpenF1TeamRadio>) => {
      stopRadio();
      const audio = new Audio(radio.recording_url);
      audioRef.current = audio;
      setCurrentRadio(radio);
      setPlaybackError(false);

      audio.onended = () => {
        setCurrentRadio(null);
        setIsAudioPlaying(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setPlaybackError(true);
        setIsAudioPlaying(false);
      };

      audio
        .play()
        .then(() => setIsAudioPlaying(true))
        .catch(() => {
          setPlaybackError(true);
          setIsAudioPlaying(false);
        });
    },
    [stopRadio],
  );

  // Auto-play team radios during playback
  useEffect(() => {
    if (!enabled || !isPlaying || !teamRadios.length) return;

    const prevTime = lastTimeMsRef.current;
    lastTimeMsRef.current = currentTimeMs;

    // Only trigger if time moved forward (not on seek backward)
    if (currentTimeMs <= prevTime) return;

    for (const radio of teamRadios) {
      const diff = currentTimeMs - radio.timestampMs;
      if (diff >= 0 && diff <= RADIO_WINDOW_MS) {
        const key = `${radio.driver_number}-${radio.timestampMs}`;
        if (!playedSetRef.current.has(key)) {
          playedSetRef.current.add(key);
          playRadio(radio);
          break;
        }
      }
    }
  }, [currentTimeMs, enabled, isPlaying, teamRadios, playRadio]);

  // Reset played set when radios change (new session)
  const teamRadiosLength = teamRadios.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: teamRadiosLength is an intentional trigger to reset when new session data loads
  useEffect(() => {
    playedSetRef.current.clear();
    stopRadio();
  }, [teamRadiosLength, stopRadio]);

  // Update last time ref for seek detection
  useEffect(() => {
    lastTimeMsRef.current = currentTimeMs;
  }, [currentTimeMs]);

  return {
    currentRadio,
    isAudioPlaying,
    playRadio,
    stopRadio,
    playbackError,
  };
};
