import { ArrowUp, CloudRain, Droplets, Gauge, Thermometer, Wind } from "lucide-react";
import { memo } from "react";
import type { OpenF1Weather } from "../types/openf1.types";
import { Tooltip } from "./Tooltip";

type WeatherBadgeProps = {
  weather: OpenF1Weather | null;
  isLoading?: boolean;
};

const COMPASS_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

const degreesToCompass = (deg: number): string => {
  const index = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS_DIRECTIONS[index];
};

const msToKmh = (ms: number): string => {
  return (ms * 3.6).toFixed(1);
};

const WeatherBadgeBase = ({ weather, isLoading = false }: WeatherBadgeProps) => {
  if (!weather) {
    if (!isLoading) return null;
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">
        <div className="h-3 w-16 rounded bg-white/10 animate-pulse" />
        <div className="h-3 w-8 rounded bg-white/10 animate-pulse" />
        <div className="h-3 w-12 rounded bg-white/10 animate-pulse" />
        <div className="h-3 w-14 rounded bg-white/10 animate-pulse" />
      </div>
    );
  }

  const isRaining = weather.rainfall > 0;
  const compassDir = degreesToCompass(weather.wind_direction);
  const windKmh = msToKmh(weather.wind_speed);
  const windLabel = `Wind: ${windKmh} km/h ${compassDir} (${weather.wind_direction}°)`;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">
      <Tooltip content="Air temperature">
        <span className="inline-flex items-center gap-1">
          <Thermometer size={16} /> {weather.air_temperature}°C
        </span>
      </Tooltip>
      <span className="text-white/20">|</span>
      <Tooltip content="Track temperature">
        <span className="inline-flex items-center gap-1">
          <Gauge size={16} /> {weather.track_temperature}°C
        </span>
      </Tooltip>
      {isRaining && (
        <>
          <span className="text-white/20">|</span>
          <Tooltip content="Rainfall">
            <span className="inline-flex items-center gap-1 text-blue-300">
              <CloudRain size={16} /> Rain
            </span>
          </Tooltip>
        </>
      )}
      <span className="text-white/20">|</span>
      <Tooltip content={windLabel}>
        <span className="inline-flex items-center gap-1">
          <Wind size={16} /> {windKmh} km/h
          <ArrowUp
            size={14}
            style={{ transform: `rotate(${(weather.wind_direction + 180) % 360}deg)` }}
          />
          {compassDir}
        </span>
      </Tooltip>
      <span className="text-white/20">|</span>
      <Tooltip content="Humidity">
        <span className="inline-flex items-center gap-1">
          <Droplets size={16} /> {weather.humidity}%
        </span>
      </Tooltip>
    </div>
  );
};

export const WeatherBadge = memo(WeatherBadgeBase);
