import { ArrowUp, CloudRain, Droplets, Gauge, Thermometer, Wind } from "lucide-react";
import type { OpenF1Weather } from "../types/openf1.types";

type WeatherBadgeProps = {
  weather: OpenF1Weather | null;
};

const COMPASS_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

const degreesToCompass = (deg: number): string => {
  const index = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return COMPASS_DIRECTIONS[index];
};

const msToKmh = (ms: number): string => {
  return (ms * 3.6).toFixed(1);
};

export const WeatherBadge = ({ weather }: WeatherBadgeProps) => {
  if (!weather) return null;

  const isRaining = weather.rainfall > 0;
  const compassDir = degreesToCompass(weather.wind_direction);
  const windKmh = msToKmh(weather.wind_speed);

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">
      <span className="inline-flex items-center gap-1" title="Air temperature">
        <Thermometer size={16} /> {weather.air_temperature}°C
      </span>
      <span className="text-white/20">|</span>
      <span className="inline-flex items-center gap-1" title="Track temperature">
        <Gauge size={16} /> {weather.track_temperature}°C
      </span>
      {isRaining && (
        <>
          <span className="text-white/20">|</span>
          <span className="inline-flex items-center gap-1 text-blue-300" title="Rainfall">
            <CloudRain size={16} /> Rain
          </span>
        </>
      )}
      <span className="text-white/20">|</span>
      <span
        className="inline-flex items-center gap-1"
        title={`Wind: ${windKmh} km/h ${compassDir} (${weather.wind_direction}°)`}
      >
        <Wind size={16} /> {windKmh} km/h
        <ArrowUp
          size={14}
          style={{ transform: `rotate(${(weather.wind_direction + 180) % 360}deg)` }}
        />
        {compassDir}
      </span>
      <span className="text-white/20">|</span>
      <span className="inline-flex items-center gap-1" title="Humidity">
        <Droplets size={16} /> {weather.humidity}%
      </span>
    </div>
  );
};
