import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Vector3 } from "three/webgpu";
import { prepareReplayCarGeometry } from "../../src/modules/replay/utils/replayCar3d.util";

test("supplied car keeps its silhouette, upright orientation, and complete material groups", () => {
  const bytes = readFileSync(new URL("../../public/models/rmgt-toon-f1-remix.stl", import.meta.url));
  const source = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const originalPosition = source.getAttribute("position");
  let noseIndex = 0;
  for (let index = 1; index < originalPosition.count; index++) {
    if (originalPosition.getX(index) > originalPosition.getX(noseIndex)) noseIndex = index;
  }
  const geometry = prepareReplayCarGeometry(source);
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  expect(geometry.index?.count / 3).toBe(8832);
  expect([...positions.array, ...normals.array].every(Number.isFinite)).toBe(true);
  const size = geometry.boundingBox!.getSize(new Vector3());
  expect(size.z).toBeCloseTo(0.118, 6);
  expect(size.x).toBeCloseTo((26.699630737304688 / 60) * 0.118, 6);
  expect(size.y).toBeCloseTo((18.024864196777344 / 60) * 0.118, 6);
  expect(geometry.boundingBox!.min.y).toBeCloseTo(0, 6);
  expect(positions.getZ(noseIndex)).toBeCloseTo(geometry.boundingBox!.max.z, 6);
  expect(geometry.groups).toHaveLength(2);
  expect(geometry.groups.map((group) => group.materialIndex)).toEqual([0, 1]);
  expect(geometry.groups.every((group) => group.count > 0 && group.count % 3 === 0)).toBe(true);
  expect(geometry.groups.reduce((sum, group) => sum + group.count, 0)).toBe(positions.count);
  expect(new Set(geometry.index!.array).size).toBe(positions.count);
  expect(geometry.userData.sharedReplayCarResource).toBe(true);
  geometry.dispose();
});
