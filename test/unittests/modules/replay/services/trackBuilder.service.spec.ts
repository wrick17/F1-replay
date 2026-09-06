import { describe, expect, it } from "bun:test";
import { computeDriverStates } from "modules/replay/services/driverState.service";
import { buildTrack, buildTrackGeometry, rotateTrackPoint } from "modules/replay/services/trackBuilder.service";
import type { ReplaySessionData } from "modules/replay/types/openf1.types";

const sample = (driverNumber: number) => Array.from({ length: 100 }, (_, i) => ({
  driver_number: driverNumber, timestampMs: 1000 + i * 240, date: "",
  x: Math.cos(i * Math.PI / 50) * 2000, y: Math.sin(i * Math.PI / 50) * 1000, z: 100,
}));
const fixture = (): ReplaySessionData => ({
  meeting: {} as ReplaySessionData["meeting"], session: {} as ReplaySessionData["session"],
  drivers: [2, 1].map((driver_number) => ({ driver_number, full_name: `Driver ${driver_number}`, name_acronym: `DR${driver_number}`, team_name: "Team", team_colour: "ffffff", headshot_url: null })),
  telemetryByDriver: Object.fromEntries([2, 1].map((driver_number) => [driver_number, {
    locations: sample(driver_number), positions: [], stints: [],
    laps: [{ driver_number, lap_number: 2, timestampMs: 1000, date_start: "", lap_duration: 24, is_pit_out_lap: false }],
  }])),
  sessionStartMs: 1000, sessionEndMs: 25000, teamRadios: [], overtakes: [], weather: [], raceControl: [], pits: [],
});

describe("track geometry", () => {
  it("uses one complete lap independent of driver order and skips pit or incomplete laps", () => {
    const data = fixture();
    data.telemetryByDriver[2].locations.forEach((p) => { p.x += 500; });
    const geometry = buildTrackGeometry(data);
    expect(geometry?.source).toBe("lap");
    expect(geometry?.points).toHaveLength(100);
    expect(geometry?.points[0]).toEqual([2000, 0]);
    data.drivers.reverse();
    expect(buildTrackGeometry(data)).toEqual(geometry);
    data.telemetryByDriver[1].laps[0].is_pit_out_lap = true;
    expect(buildTrackGeometry(data)?.points[0]).toEqual([2500, 0]);
    data.telemetryByDriver[2].locations.splice(40, 15);
    expect(buildTrackGeometry(data)).toBeUndefined();
  });

  it("rejects discontinuities, missing endpoints and pit entry laps instead of drawing chords", () => {
    for (const corrupt of [
      (d: ReplaySessionData) => { d.telemetryByDriver[1].locations[40].x = 999999; },
      (d: ReplaySessionData) => { d.telemetryByDriver[1].locations.splice(0, 20); },
      (d: ReplaySessionData) => { d.telemetryByDriver[1].locations.splice(80); },
      (d: ReplaySessionData) => { d.telemetryByDriver[1].locations[40].y = Number.NaN; },
      (d: ReplaySessionData) => { d.pits.push({ driver_number: 1, lap_number: 2 } as ReplaySessionData["pits"][number]); },
    ]) {
      const data = fixture();
      delete data.telemetryByDriver[2];
      corrupt(data);
      expect(buildTrack(data).trackPath).toEqual([]);
    }
  });

  it("keeps canonical geometry identical across sessions and aligns rotated driver coordinates", () => {
    const data = fixture();
    data.trackGeometry = { points: [[2000, 0], [0, 1000], [-2000, 0], [0, -1000]], rotation: 280, source: "circuit" };
    const track = buildTrack(data);
    const driver = computeDriverStates(data, 1000, track.normalization)[1];
    expect(rotateTrackPoint(driver.position!, track.rotation)).toEqual({ ...track.trackPath[0], z: driver.position!.z });
    data.telemetryByDriver = new Proxy({}, { ownKeys: () => { throw new Error("canonical track must not scan telemetry"); } });
    data.session.session_name = "Qualifying";
    data.drivers.reverse();
    expect(buildTrack(data).trackPath).toEqual(track.trackPath);
    expect(track.trackPath[0]).toEqual(track.trackPath.at(-1));
  });
});
