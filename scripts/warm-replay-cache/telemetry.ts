import type { OpenF1Driver, ReplayTelemetry } from "../../src/modules/replay/types/openf1.types";
import { groupByDriverNumber } from "../../src/modules/replay/utils/telemetry.util";

export const toMs = (isoDate: string) => new Date(isoDate).getTime();

export const createTelemetryMap = (drivers: OpenF1Driver[]) => {
  return drivers.reduce<Record<number, ReplayTelemetry>>((acc, driver) => {
    acc[driver.driver_number] = {
      locations: [],
      positions: [],
      stints: [],
      laps: [],
    };
    return acc;
  }, {});
};

export const chunkAppend = <T extends { driver_number: number }>(
  map: Record<number, T[]>,
  chunk: T[],
) => {
  const grouped = groupByDriverNumber(chunk);
  Object.entries(grouped).forEach(([driverKey, samples]) => {
    const driverNumber = Number(driverKey);
    if (!map[driverNumber]) {
      map[driverNumber] = [];
    }
    map[driverNumber].push(...samples);
  });
};
