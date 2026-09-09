import { expect,test } from "bun:test";
import {BoxGeometry,CatmullRomCurve3,MeshStandardMaterial,Vector3} from "three/webgpu";
import {createReplayInstances3D,replayFloodlightHeights3D,replayFloodlightPlacements3D,replayFloodlightProgresses3D} from "../../src/modules/replay/utils/replayWorld3d.util";

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

test("floodlights cover the full circuit and pit lane",()=>{
 for(const [length,closed,maximum] of [[2.4,true,.02],[.43,false,.018]] as const){
  const progress=replayFloodlightProgresses3D(length,closed);
  expect(progress[0]).toBe(0);
  if(!closed)expect(progress.at(-1)).toBe(1);
  const gaps=progress.slice(1).map((value,index)=>(value-progress[index])*length);
  if(closed)gaps.push((1-progress.at(-1)!)*length);
  expect(Math.max(...gaps)).toBeLessThanOrEqual(maximum+1e-12);
 }
 const curve=new CatmullRomCurve3([new Vector3(0,0,0),new Vector3(.4,.05,0),new Vector3(.8,0,.2)],false,"centripetal");
 const placements=replayFloodlightPlacements3D(curve,false,()=>true);
 expect(placements).toHaveLength(replayFloodlightProgresses3D(curve.getLength(),false).length);
 expect(placements.every(({fixture})=>fixture===undefined)).toBe(true);
 expect(placements.every(({point})=>Number.isFinite(point.y))).toBe(true);
 expect(replayFloodlightHeights3D(.2,.1,true)).toEqual({baseY:.2,headY:.22});
 expect(replayFloodlightHeights3D(.1,.1,true).headY).toBeCloseTo(.12);
 expect(replayFloodlightHeights3D(.2,.1,false).headY).toBeCloseTo(.208);
});
