import { expect,test } from "bun:test";
import {PerspectiveCamera,Spherical,Vector3} from "three/webgpu";
import type {MapPolygon} from "../../src/modules/replay/types/circuitSurroundings.types";
import {constrainMapCamera3D,fitTrackOverviewCamera3D} from "../../src/modules/replay/utils/mapCamera3d.util";
import {mapContainsPoint} from "../../src/modules/replay/utils/circuitMapGeometry.util";

const coverage:MapPolygon=[[[-2.2,-2.2],[2.2,-2.2],[2.2,2.2],[-2.2,2.2],[-2.2,-2.2]]];
test("bounded panning preserves side angles across every orbit direction and screen aspect",()=>{
 for(const aspect of [0.46,1.6,2048/900,3])for(const polar of [0.12,78*Math.PI/180])for(let angle=0;angle<360;angle+=15){
  const camera=new PerspectiveCamera(42,aspect,0.006,64),target=new Vector3(4,.3,-3),center=new Vector3(0,.2,0);
  camera.position.copy(target).add(new Vector3().setFromSpherical(new Spherical(8,polar,angle*Math.PI/180)));
  const maximum=constrainMapCamera3D(camera,target,coverage,center,1,0.028,8);
  const offset=new Spherical().setFromVector3(camera.position.clone().sub(target));
  expect(offset.phi).toBeCloseTo(polar,8);
  expect(Math.abs(target.x)).toBeLessThanOrEqual(.8);
  expect(Math.abs(target.z)).toBeLessThanOrEqual(.8);
  expect(mapContainsPoint([target.x,target.z],coverage)).toBe(true);
  expect(mapContainsPoint([camera.position.x,camera.position.z],coverage)).toBe(true);
  expect(camera.position.distanceTo(target)).toBeLessThanOrEqual(maximum+1e-8);
 }
});
test("overhead zoom has twice the reset range and paused constraints settle",()=>{
 const camera=new PerspectiveCamera(42,3,.006,64),target=new Vector3(),center=new Vector3();
 camera.position.set(0,8,0);camera.lookAt(target);
 expect(constrainMapCamera3D(camera,target,coverage,center,1,.028,8)).toBe(8);
 expect(camera.position.distanceTo(target)).toBeCloseTo(8);
 const saved=camera.position.clone();
 constrainMapCamera3D(camera,target,coverage,center,1,.028,8);
 expect(camera.position.distanceTo(saved)).toBeLessThan(1e-10);
});

test("default and reset preserve the flat map axes and fit the actual track inside the HUD gap",()=>{
 const points=Array.from({length:120},(_,i)=>({x:Math.cos(i*Math.PI/60),y:Math.sin(i*Math.PI/30)*.03,z:Math.sin(i*Math.PI/60)*.32}));
 for(const [width,height,usableWidth,usableHeight] of [[1440,900,850,620],[2048,900,1458,620],[390,844,351,439]]){
  const camera=new PerspectiveCamera(42,width/height,.006,64),target=new Vector3();
  camera.setViewOffset(width,height,width>900?45:0,width>900?25:-height*.12,width,height);
  const distance=fitTrackOverviewCamera3D(camera,target,points,usableWidth/width,usableHeight/height);
  const origin=target.clone().project(camera),right=new Vector3(.1,0,0).project(camera),down=new Vector3(0,0,.1).project(camera);
  expect(right.x).toBeGreaterThan(origin.x);expect(right.y).toBeCloseTo(origin.y,8);
  expect(down.y).toBeLessThan(origin.y);expect(down.x).toBeCloseTo(origin.x,8);
  for(const point of points){const screen=new Vector3(point.x,point.y,point.z).project(camera);expect(Math.abs(screen.x-origin.x)).toBeLessThanOrEqual(usableWidth/width*.92+1e-7);expect(Math.abs(screen.y-origin.y)).toBeLessThanOrEqual(usableHeight/height*.92+1e-7);}
  const initial=camera.position.clone();camera.position.set(4,2,-1);
  expect(fitTrackOverviewCamera3D(camera,target,points,usableWidth/width,usableHeight/height)).toBeCloseTo(distance,8);
  expect(camera.position.distanceTo(initial)).toBeLessThan(1e-10);
 }
});
