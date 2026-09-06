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

it("retains a past measured driver location during gaps and after the feed ends, without inventing a future position", () => {
  const data = fixture();
  data.telemetryByDriver[1].locations = [sample(1)[0], { ...sample(1)[0], timestampMs: 20000, x: -2000 }];
  const normalization = buildTrack(data).normalization;
  expect(computeDriverStates(data, 500, normalization)[1]).toMatchObject({ position: null, locationStatus: "unavailable" });
  expect(computeDriverStates(data, 1000, normalization)[1].locationStatus).toBe("live");
  expect(computeDriverStates(data, 10000, normalization)[1]).toMatchObject({
    position: computeDriverStates(data, 1000, normalization)[1].position, locationStatus: "stale",
  });
  expect(computeDriverStates(data, 100000, normalization)[1]).toMatchObject({
    position: computeDriverStates(data, 20000, normalization)[1].position, locationStatus: "stale",
  });
});

it("extracts a continuous measured pit traversal and rejects a gap or a route that never rejoins", async () => {
  const { buildPitLaneGeometry } = await import("modules/replay/services/trackBuilder.service");
  const data = fixture();
  data.trackGeometry = { points: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], rotation: 90, source: "circuit" };
  const locations = Array.from({ length: 60 }, (_, i) => ({ ...sample(1)[0], timestampMs: i * 500,
    x: 100 + (i > 25 && i < 30 ? 25 : i) * 10, y: i < 10 || i >= 50 ? 0 : -40, z: 0 }));
  data.telemetryByDriver[1].locations = locations;
  data.pits = [{ driver_number: 1, timestampMs: 20000, pit_duration: 20 } as ReplaySessionData["pits"][number]];
  const pitLane = buildPitLaneGeometry(data);
  expect(pitLane.length).toBeGreaterThan(8);
  expect(pitLane[0][1]).toBe(0);
  expect(pitLane.at(-1)![1]).toBe(0);
  expect(pitLane.some((point) => point[1] === -40)).toBe(true);
  data.pits = [];
  data.telemetryByDriver[1].laps = [{ ...data.telemetryByDriver[1].laps[0], timestampMs: 20000, is_pit_out_lap: true }];
  expect(buildPitLaneGeometry(data)).toEqual(pitLane);
  data.trackGeometry.pitLane = pitLane;
  expect(buildTrack(data).pitLanePath).toHaveLength(pitLane.length);
  data.telemetryByDriver[1].locations = locations.filter((point) => point.timestampMs < 10000 || point.timestampMs > 15000);
  expect(buildPitLaneGeometry(data)).toEqual([]);
  data.telemetryByDriver[1].locations = locations.slice(0, 45);
  expect(buildPitLaneGeometry(data)).toEqual([]);
  data.telemetryByDriver[1].locations = locations.map((point, index) => ({ ...point, x: 100 + index * 10 }));
  expect(buildPitLaneGeometry(data)).toEqual([]); // a normal racing-line deviation without a stop

});
