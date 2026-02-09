import type { OpenF1Driver, ReplaySessionData } from "../types/openf1.types";
import type { DriverRenderState, TeamBranding } from "../types/replay.types";
import { formatTrackLabel } from "../utils/format.util";
import { getTeamDisplayName, getTeamInitials, getTeamLogoUrl } from "../utils/teamBranding.util";
import { getCurrentPosition, interpolateLocation } from "../utils/telemetry.util";

type Normalization = {
  scale: number;
  offset: { x: number; y: number; z: number };
};

export const computeDriverStates = (
  data: ReplaySessionData,
  currentTimeMs: number,
  normalization: Normalization,
): Record<number, DriverRenderState> => {
  const map: Record<number, DriverRenderState> = {};
  data.drivers.forEach((driver) => {
    const telemetry = data.telemetryByDriver[driver.driver_number];
    const locationSample = interpolateLocation(telemetry?.locations ?? [], currentTimeMs);
    const positionSample = getCurrentPosition(telemetry?.positions ?? [], currentTimeMs);
    const racePosition = positionSample?.position ?? null;
    if (
      locationSample &&
      Number.isFinite(locationSample.x) &&
      Number.isFinite(locationSample.y) &&
      Number.isFinite(locationSample.z)
    ) {
      map[driver.driver_number] = {
        position: {
          x: (locationSample.x - normalization.offset.x) * normalization.scale,
          y: (locationSample.y - normalization.offset.y) * normalization.scale,
          z: (locationSample.z - normalization.offset.z) * normalization.scale,
        },
        color: `#${driver.team_colour}`,
        racePosition,
      };
    } else {
      map[driver.driver_number] = {
        position: null,
        color: `#${driver.team_colour}`,
        racePosition,
      };
    }
  });
  return map;
};

export const buildDriverNames = (drivers: OpenF1Driver[]): Record<number, string> => {
  return drivers.reduce<Record<number, string>>((acc, driver) => {
    acc[driver.driver_number] = formatTrackLabel(driver);
    return acc;
  }, {});
};

export const buildDriverTeams = (drivers: OpenF1Driver[]): Record<number, TeamBranding> => {
  return drivers.reduce<Record<number, TeamBranding>>((acc, driver) => {
    const name = getTeamDisplayName(driver.team_name);
    acc[driver.driver_number] = {
      name,
      logoUrl: getTeamLogoUrl(name),
      initials: getTeamInitials(name),
    };
    return acc;
  }, {});
};
