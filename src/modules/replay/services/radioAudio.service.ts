import type { OpenF1TeamRadio, TimedSample } from "../types/openf1.types";

type RadioAnalyser = {
  analyser: AnalyserNode;
  data: Uint8Array;
};

const audioCache = new Map<string, HTMLAudioElement>();
const analyserCache = new Map<string, RadioAnalyser>();
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const Context =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) {
    return null;
  }
  if (!audioContext) {
    audioContext = new Context();
  }
  return audioContext;
};

export const getRadioAudioElement = (url: string) => {
  if (!url) {
    return null;
  }
  const cached = audioCache.get(url);
  if (cached) {
    return cached;
  }
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  audioCache.set(url, audio);
  return audio;
};

const isCrossOriginAudio = (url: string) => {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
};

export const preloadRadioAudios = (radios: TimedSample<OpenF1TeamRadio>[]) => {
  const urls = Array.from(
    new Set(radios.map((radio) => radio.recording_url).filter((url): url is string => !!url)),
  );
  urls.forEach((url) => {
    const audio = getRadioAudioElement(url);
    audio?.load();
  });
};

export const ensureRadioAnalyser = (url: string) => {
  if (!url) {
    return null;
  }
  const cached = analyserCache.get(url);
  if (cached) {
    return cached;
  }
  const audio = getRadioAudioElement(url);
  const context = getAudioContext();
  if (!audio || !context || isCrossOriginAudio(url)) {
    return null;
  }
  try {
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyser.connect(context.destination);
    const data = new Uint8Array(analyser.fftSize);
    const handle = { analyser, data };
    analyserCache.set(url, handle);
    return handle;
  } catch (error) {
    console.warn("Failed to attach radio analyser", url, error);
    return null;
  }
};

export const resumeRadioAudioContext = async () => {
  const context = getAudioContext();
  if (context && context.state === "suspended") {
    try {
      await context.resume();
    } catch (error) {
      console.warn("Failed to resume audio context", error);
    }
  }
};
