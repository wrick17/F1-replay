import { useCallback, useRef, useState } from "react";
import { getRadioAudioElement, resumeRadioAudioContext } from "../services/radioAudio.service";
import type { OpenF1TeamRadio, TimedSample } from "../types/openf1.types";

type UseTeamRadioResult = {
  currentRadio: TimedSample<OpenF1TeamRadio> | null;
  isAudioPlaying: boolean;
  playRadio: (radio: TimedSample<OpenF1TeamRadio>) => void;
  stopRadio: () => void;
  pauseRadio: () => void;
  resumeRadio: () => void;
  playbackError: boolean;
};

export const useTeamRadio = (): UseTeamRadioResult => {
  const [currentRadio, setCurrentRadio] = useState<TimedSample<OpenF1TeamRadio> | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopRadio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
    }
    audioRef.current = null;
    setCurrentRadio(null);
    setIsAudioPlaying(false);
    setPlaybackError(false);
  }, []);

  const playRadio = useCallback(
    (radio: TimedSample<OpenF1TeamRadio>) => {
      stopRadio();
      const audio = getRadioAudioElement(radio.recording_url);
      if (!audio) {
        return;
      }
      audio.currentTime = 0;
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
        .then(async () => {
          await resumeRadioAudioContext();
          setIsAudioPlaying(true);
        })
        .catch(() => {
          setPlaybackError(true);
          setIsAudioPlaying(false);
        });
    },
    [stopRadio],
  );

  const pauseRadio = useCallback(() => {
    if (audioRef.current && isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    }
  }, [isAudioPlaying]);

  const resumeRadio = useCallback(() => {
    if (audioRef.current && !isAudioPlaying && currentRadio) {
      audioRef.current
        .play()
        .then(async () => {
          await resumeRadioAudioContext();
          setIsAudioPlaying(true);
        })
        .catch(() => {
          setPlaybackError(true);
          setIsAudioPlaying(false);
        });
    }
  }, [isAudioPlaying, currentRadio]);

  return {
    currentRadio,
    isAudioPlaying,
    playRadio,
    stopRadio,
    pauseRadio,
    resumeRadio,
    playbackError,
  };
};
