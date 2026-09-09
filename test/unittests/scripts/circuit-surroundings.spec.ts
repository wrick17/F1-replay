import { expect, test } from "bun:test";
import type { CircuitSurroundings } from "../../../src/modules/replay/types/circuitSurroundings.types";
import { mapContainsPoint } from "../../../src/modules/replay/utils/circuitMapGeometry.util";
import { coastlineWaterPolygons } from "../../../scripts/helpers/circuit-surroundings";

test("coastline polygons preserve OSM's water-on-the-right direction", () => {
  const bounds: [number, number, number, number] = [0, 0, 10, 10];
  const south = coastlineWaterPolygons([[[0, 4], [5, 5]], [[5, 5], [10, 4]]], bounds);
  const north = coastlineWaterPolygons([[[10, 4], [5, 5]], [[5, 5], [0, 4]]], bounds);

  expect(south).toHaveLength(1);
  expect(mapContainsPoint([5, 1], south[0])).toBe(true);
  expect(mapContainsPoint([5, 9], south[0])).toBe(false);
  expect(mapContainsPoint([5, 9], north[0])).toBe(true);
  expect(mapContainsPoint([5, 1], north[0])).toBe(false);
});

test("coastline closure follows wrapped bounds and preserves island land", () => {
  const polygons = coastlineWaterPolygons(
    [
      [[5, 0], [2, 0.5], [0, 1]],
      [[1, 2], [1, 2.5], [1.5, 2.5], [1.5, 2], [1, 2]],
    ],
    [0, 0, 10, 10],
  );

  expect(polygons).toHaveLength(1);
  expect(polygons[0]).toHaveLength(2);
  expect(mapContainsPoint([1, 5], polygons[0])).toBe(true);
  expect(mapContainsPoint([1, 0.1], polygons[0])).toBe(false);
  expect(mapContainsPoint([1.25, 2.25], polygons[0])).toBe(false);
});

test("coastline generation rejects a chain broken by a missing relation member", () => {
  const first: [number, number][] = [[0, 4], [4, 4]];
  const member: [number, number][] = [[4, 4], [6, 4]];
  const last: [number, number][] = [[6, 4], [10, 4]];

  expect(coastlineWaterPolygons([first, member, last], [0, 0, 10, 10])).toHaveLength(1);
  expect(() => coastlineWaterPolygons([first, last], [0, 0, 10, 10])).toThrow(
    "Coastline chain has an endpoint inside the map bounds",
  );
});

test("Monaco surroundings include Port Hercule as water", async () => {
  const data = (await Bun.file("public/circuits/22.json").json()) as CircuitSurroundings;
  const harbor: [number, number] = [0, 0];

  expect(
    data.areas.some(
      (area) =>
        area.kind === "water" && area.polygons.some((polygon) => mapContainsPoint(harbor, polygon)),
    ),
  ).toBe(true);
});
