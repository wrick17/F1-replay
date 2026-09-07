import { expect,test } from "bun:test";
import {BoxGeometry,MeshStandardMaterial} from "three/webgpu";
import {createReplayInstances3D} from "../../src/modules/replay/utils/replayWorld3d.util";

test("empty mapped scenery batches retain valid WebGPU matrix storage without drawing",()=>{
 const geometry=new BoxGeometry(),material=new MeshStandardMaterial();
 for(const count of [0,1,6,2300]){
  const mesh=createReplayInstances3D(geometry,material,count);
  expect(mesh.count).toBe(count);
  expect(mesh.visible).toBe(count>0);
  expect(mesh.instanceMatrix.array.byteLength).toBe(Math.max(1,count)*16*4);
  expect(mesh.instanceMatrix.count).toBeGreaterThanOrEqual(1);
  mesh.dispose();
 }
 geometry.dispose();material.dispose();
});
