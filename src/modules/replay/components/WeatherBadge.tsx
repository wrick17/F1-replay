import type { OpenF1Weather } from "../types/openf1.types";

type WeatherBadgeProps = {
  weather: OpenF1Weather | null;
};

export const WeatherBadge = ({ weather }: WeatherBadgeProps) => {
  if (!weather) return null;

  const isRaining = weather.rainfall > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md">
      <span title="Air temperature">🌡 {weather.air_temperature}°C</span>
      <span className="text-white/20">|</span>
      <span title="Track temperature">🛣 {weather.track_temperature}°C</span>
      {isRaining && (
        <>
          <span className="text-white/20">|</span>
          <span className="text-blue-300" title="Rainfall">
            🌧 Rain
          </span>
        </>
      )}
      <span className="text-white/20">|</span>
      <span title={`Wind direction: ${weather.wind_direction}°`}>💨 {weather.wind_speed} m/s</span>
      <span className="text-white/20">|</span>
      <span title="Humidity">💧 {weather.humidity}%</span>
    </div>
  );
};
