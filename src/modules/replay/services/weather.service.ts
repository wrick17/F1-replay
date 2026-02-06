import type { OpenF1Weather, TimedSample } from "../types/openf1.types";

export const getWeatherAtTime = (
  weather: TimedSample<OpenF1Weather>[],
  currentTimeMs: number,
): OpenF1Weather | null => {
  if (!weather.length) return null;

  let left = 0;
  let right = weather.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (weather[mid].timestampMs <= currentTimeMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return right >= 0 ? weather[right] : null;
};
