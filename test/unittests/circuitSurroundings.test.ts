import { expect, test } from "bun:test";
import elevationCatalog from "../../src/modules/replay/data/circuitElevations.json";
import type { CircuitSurroundings } from "../../src/modules/replay/types/circuitSurroundings.types";
import { validateCircuitSurroundings } from "../../src/modules/replay/utils/circuitSurroundings.util";

const fixture = (): CircuitSurroundings => ({
  schemaVersion: 1,
  circuitKey: 46,
  geometry: {
    sha256: "a".repeat(64),
    anchors: Array.from({ length: 12 }, (_, i) => [i / 12, 0, 0]),
    referencePlanarLengthRaw: 58000,
  },
  source: {
    snapshotAt: "2026-09-07T00:00:00Z",
    url: "https://www.openstreetmap.org",
    attribution: "© OpenStreetMap contributors",
  },
  metersToWorld: 0.0004,
  coverage: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ],
  buildings: [],
  roads: [],
  areas: [],
  terrain: {
    width: 2,
    height: 2,
    bounds: [0, 0, 1, 1],
    heights: [10, 12, 15, 20],
    source: {
      attribution: "Copernicus",
      url: "https://registry.opendata.aws/copernicus-dem/",
      license: "Copernicus DEM",
    },
  },
});

test("map assets reject invalid coordinates and DEM grids before rendering", () => {
  expect(validateCircuitSurroundings(fixture()).terrain?.heights).toEqual([
    10, 12, 15, 20,
  ]);
  const bad = fixture();
  bad.coverage[0][1][0] = Number.NaN;
  expect(() => validateCircuitSurroundings(bad)).toThrow();
  const grid = fixture();
  grid.terrain!.heights.pop();
  expect(() => validateCircuitSurroundings(grid)).toThrow();
  expect(() => validateCircuitSurroundings({ schemaVersion: 1 })).toThrow();
});

test("every archived circuit ships a loadable map and terrain grid", async () => {
  for (const { circuitKey } of elevationCatalog.profiles) {
    const file = Bun.file(new URL(`../../public/circuits/${circuitKey}.json`, import.meta.url));
    const body = await file.text();
    expect(body.length).toBeLessThanOrEqual(20_000_000);
    const data = validateCircuitSurroundings(JSON.parse(body));
    expect(data.circuitKey).toBe(circuitKey);
    expect(data.terrain).toBeDefined();
    expect(data.terrain?.heights).toHaveLength(
      (data.terrain?.width ?? 0) * (data.terrain?.height ?? 0),
    );
  }
});
