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
      <div className="flex w-full flex-nowrap items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[10px] text-white/70 whitespace-nowrap backdrop-blur-md sm:gap-2.5 sm:px-3 sm:text-xs md:w-auto md:justify-start">
        <div className="h-2.5 w-10 rounded bg-white/10 animate-pulse sm:h-3 sm:w-16" />
        <div className="h-2.5 w-8 rounded bg-white/10 animate-pulse sm:h-3 sm:w-8" />
        <div className="h-2.5 w-8 rounded bg-white/10 animate-pulse sm:h-3 sm:w-12" />
        <div className="h-2.5 w-10 rounded bg-white/10 animate-pulse sm:h-3 sm:w-14" />
      </div>
    );
  }

  const isRaining = weather.rainfall > 0;
  const compassDir = degreesToCompass(weather.wind_direction);
  const windKmh = msToKmh(weather.wind_speed);
  const windLabel = `Wind: ${windKmh} km/h ${compassDir} (${weather.wind_direction}°)`;

  return (
    <div className="flex w-full flex-nowrap items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[10px] text-white/70 whitespace-nowrap backdrop-blur-md sm:gap-2.5 sm:px-3 sm:text-xs md:w-auto md:justify-start">
      <Tooltip content="Air temperature">
        <span className="inline-flex shrink-0 items-center gap-1">
          <Thermometer className="h-3 w-3 sm:h-4 sm:w-4" /> {weather.air_temperature}°
        </span>
      </Tooltip>
      <span className="hidden shrink-0 text-white/20 sm:inline">|</span>
      <Tooltip content="Track temperature">
        <span className="inline-flex shrink-0 items-center gap-1">
          <Gauge className="h-3 w-3 sm:h-4 sm:w-4" /> {weather.track_temperature}°
        </span>
      </Tooltip>
      {isRaining && (
        <>
          <span className="hidden shrink-0 text-white/20 sm:inline">|</span>
          <Tooltip content="Rainfall">
            <span className="inline-flex shrink-0 items-center gap-1 text-blue-300">
              <CloudRain className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Rain</span>
            </span>
          </Tooltip>
        </>
      )}
      <span className="hidden shrink-0 text-white/20 sm:inline">|</span>
      <Tooltip content={windLabel}>
        <span className="inline-flex shrink-0 items-center gap-1">
          <Wind className="h-3 w-3 sm:h-4 sm:w-4" /> {windKmh}
          <span className="hidden sm:inline">km/h</span>
          <ArrowUp
            className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5"
            style={{ transform: `rotate(${(weather.wind_direction + 180) % 360}deg)` }}
          />
          {compassDir}
        </span>
      </Tooltip>
      <span className="hidden shrink-0 text-white/20 sm:inline">|</span>
      <Tooltip content="Humidity">
        <span className="inline-flex shrink-0 items-center gap-1">
          <Droplets className="h-3 w-3 sm:h-4 sm:w-4" /> {weather.humidity}%
        </span>
      </Tooltip>
    </div>
  );
};

export const WeatherBadge = memo(WeatherBadgeBase);
