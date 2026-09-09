import { describe, expect, test } from "bun:test";
import { getReplayEnvironment } from "../../src/modules/replay/utils/replayEnvironment.util";
import { replayVolumetricState3D } from "../../src/modules/replay/utils/replayVolumetricLighting3d.util";

describe("replay volumetric lighting", () => {
  test("costs nothing in clear daylight and strengthens in rainy night air", () => {
    const clearDay = getReplayEnvironment(Date.parse("2026-09-09T12:00:00Z"), "+00:00", {
      air_temperature: 25,
      date: "2026-09-09T12:00:00Z",
      humidity: 35,
      meeting_key: 1,
      pressure: 1012,
      rainfall: 0,
      session_key: 1,
      track_temperature: 32,
      wind_direction: 0,
      wind_speed: 1,
    });
    const clearNight = { ...clearDay, localHour: 23 };
    const wetNight = { ...clearNight, humidity: 92, rainfall: 1, cloudCover: 0.95 };

    expect(replayVolumetricState3D(clearDay).active).toBe(false);
    expect(replayVolumetricState3D(clearNight).active).toBe(true);
    expect(replayVolumetricState3D(wetNight).density).toBeGreaterThan(
      replayVolumetricState3D(clearNight).density,
    );
  });
});
