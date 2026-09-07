import type { OpenF1Weather } from "../types/openf1.types";

export type ReplayEnvironment = {
  localHour: number;
  rainfall: number;
  cloudCover: number;
  windSpeed: number;
  windDirection: number;
  timeMs: number;
  timeKnown: boolean;
  weatherKnown: boolean;
};

export const getReplayEnvironment = (
  timeMs: number,
  gmtOffset: string | undefined,
  weather: OpenF1Weather | null,
): ReplayEnvironment => {
  const match = /^([+-]?)(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(gmtOffset ?? "");
  const timeKnown = Boolean(
    Number.isFinite(timeMs) &&
      timeMs > 0 &&
      match &&
      Number(match[2]) <= 14 &&
      Number(match[3]) < 60 &&
      Number(match[4] ?? 0) < 60,
  );
  const offsetSeconds =
    timeKnown && match
      ? (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0)) *
        (match[1] === "-" ? -1 : 1)
      : 0;
  const local = new Date(timeMs + offsetSeconds * 1000);
  const rainfall = weather && Number.isFinite(weather.rainfall) && weather.rainfall > 0 ? 1 : 0;
  return {
    // Legacy metadata without an offset gets neutral daylight, never the viewer's timezone.
    localHour: timeKnown
      ? local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600
      : 12,
    rainfall,
    // OpenF1 records rain presence, not cloud cover/intensity. Clouds are a visual interpretation.
    cloudCover: rainfall ? 0.95 : 0.18,
    windSpeed:
      weather && Number.isFinite(weather.wind_speed)
        ? Math.max(0, Math.min(100, weather.wind_speed))
        : 0,
    windDirection:
      weather && Number.isFinite(weather.wind_direction)
        ? ((weather.wind_direction % 360) + 360) % 360
        : 0,
    timeMs: Number.isFinite(timeMs) ? timeMs : 0,
    timeKnown,
    weatherKnown: weather !== null,
  };
};
