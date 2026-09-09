import { expect, test } from "bun:test";
import { getReplayEnvironment } from "../../src/modules/replay/utils/replayEnvironment.util";
import { getWeatherAtTime } from "../../src/modules/replay/services/weather.service";

test("world uses race-local time and recorded weather at the replay cursor, including reverse seeks", () => {
  const start = Date.parse("2026-06-14T13:00:00Z");
  const dry = { date: new Date(start).toISOString(), timestampMs: start, rainfall: 0, wind_speed: 3, wind_direction: 90, air_temperature: 25, track_temperature: 35, humidity: 70, pressure: 1000, session_key: 1, meeting_key: 1 };
  const wet = { ...dry, timestampMs: start + 60_000, rainfall: 1, wind_speed: 8, wind_direction: 270 };
  const at = (time: number) => getReplayEnvironment(time, "02:00:00", getWeatherAtTime([dry, wet], time));
  expect(at(start)).toMatchObject({
    localHour: 15,
    rainfall: 0,
    humidity: 70,
    windSpeed: 3,
    weatherKnown: true,
  });
  expect(at(start + 60_000)).toMatchObject({
    localHour: 15 + 1 / 60,
    rainfall: 1,
    humidity: 70,
    windSpeed: 8,
    windDirection: 270,
  });
  expect(at(start)).toMatchObject({ rainfall: 0, windSpeed: 3 });
  expect(getReplayEnvironment(Date.parse("2026-11-22T07:00:00Z"), "-08:00:00", null)).toMatchObject({ localHour: 23, timeKnown: true, weatherKnown: false });
  expect(getReplayEnvironment(start, "05:30:00", null).localHour).toBe(18.5);
  expect(getReplayEnvironment(start, undefined, null)).toMatchObject({ localHour: 12, timeKnown: false, weatherKnown: false });
  expect(getReplayEnvironment(start, "99:99:00", null).timeKnown).toBe(false);
});
