import { expect, test } from "bun:test";
import { LinearMipmapLinearFilter, RepeatWrapping } from "three/webgpu";
import {
  createReplayAsphaltTexture3D,
  createReplayWaterTexture3D,
  replayWorldUvs3D,
} from "../../src/modules/replay/utils/replayMaterials3d.util";

test("asphalt uses deterministic world UVs and one tiny repeating height tile", () => {
  expect([...replayWorldUvs3D([1, 9, 2, -3, 8, 4], 10)]).toEqual([10, 20, -30, 40]);

  const first = createReplayAsphaltTexture3D();
  const second = createReplayAsphaltTexture3D();
  const pixels = first.image.data as Uint8Array;
  expect(first.image.width).toBe(128);
  expect(first.image.height).toBe(128);
  expect(first.wrapS).toBe(RepeatWrapping);
  expect(first.wrapT).toBe(RepeatWrapping);
  expect(first.minFilter).toBe(LinearMipmapLinearFilter);
  const grain = pixels.filter((_, index) => index % 4 === 0);
  expect(Math.min(...grain)).toBeGreaterThanOrEqual(104);
  expect(Math.max(...grain)).toBeLessThanOrEqual(152);
  expect(pixels).toEqual(second.image.data);
  first.dispose();
  second.dispose();
});

test("water uses a deterministic tileable crossing-wave height texture", () => {
  const first = createReplayWaterTexture3D();
  const second = createReplayWaterTexture3D();
  const pixels = first.image.data as Uint8Array;
  expect(first.image.width).toBe(128);
  expect(first.image.height).toBe(128);
  expect(first.wrapS).toBe(RepeatWrapping);
  expect(first.wrapT).toBe(RepeatWrapping);
  expect(first.minFilter).toBe(LinearMipmapLinearFilter);
  const heights = [...pixels].filter((_, index) => index % 4 === 0);
  expect(Math.min(...heights)).toBe(86);
  expect(Math.max(...heights)).toBe(170);
  expect(Math.abs(heights[0] - heights[127])).toBeLessThan(8);
  expect(pixels).toEqual(second.image.data);
  first.dispose();
  second.dispose();
});
