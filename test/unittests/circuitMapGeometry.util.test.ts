import { PlaneGeometry } from "three/webgpu";
import { expect, test } from "bun:test";
import type { MapPolygon } from "../../src/modules/replay/types/circuitSurroundings.types";
import {mapContainsPoint,mapPolygonPath,sampleMapTerrain,mapScreenBounds2D} from "../../src/modules/replay/utils/circuitMapGeometry.util";
import {mappedBuildingGeometry3D,mappedFoundation3D} from "../../src/modules/replay/utils/mappedWorld3d.util";

const courtyard:MapPolygon=[[[0,0],[1,0],[1,1],[0,1],[0,0]],[[0.3,0.3],[0.7,0.3],[0.7,0.7],[0.3,0.7],[0.3,0.3]]];
test("mapped polygons preserve courtyard holes in both flat and extruded geometry",()=>{
 expect(mapContainsPoint([0.1,0.1],courtyard)).toBe(true);
 expect(mapContainsPoint([0.5,0.5],courtyard)).toBe(false);
 expect(mapContainsPoint([2,0.5],courtyard)).toBe(false);
 expect(mapPolygonPath(courtyard).match(/Z/g)).toHaveLength(2);
 const geometry=mappedBuildingGeometry3D(courtyard,2,5);geometry.computeBoundingBox();
 expect(geometry.boundingBox!.min.y).toBeCloseTo(2);expect(geometry.boundingBox!.max.y).toBeCloseTo(5);
 const p=geometry.getAttribute("position");let roofArea=0;
 for(let i=0;i<p.count;i+=3){if([i,i+1,i+2].every(j=>Math.abs(p.getY(j)-5)<1e-5)){
 const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
 expect(mapContainsPoint([x,z],courtyard)).toBe(true);
 roofArea+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)))/2;
 }}
 expect(roofArea).toBeCloseTo(0.84,6);geometry.dispose();
});
test("terrain samples the actual grid orientation and declines missing coverage",()=>{
 const terrain={width:2,height:2,bounds:[0,0,1,1] as [number,number,number,number],heights:[10,20,30,40],source:{url:"test",license:"test",attribution:"test"}};
 expect(sampleMapTerrain(terrain,[0,0])).toBe(10);expect(sampleMapTerrain(terrain,[1,1])).toBe(40);
 expect(sampleMapTerrain(terrain,[0.5,0.5])).toBe(25);expect(sampleMapTerrain(terrain,[-0.1,0.5])).toBeUndefined();
 expect(sampleMapTerrain({...terrain,heights:[NaN,20,30,40]},[0.5,0.5])).toBeUndefined();
});

test("mapped foundations clear interior terrain peaks and exclude courtyard interiors",()=>{
 const geometry=new PlaneGeometry(1,1,4,4);geometry.rotateX(-Math.PI/2);
 const positions=geometry.getAttribute("position");
 for(let i=0;i<positions.count;i++)positions.setXYZ(i,(i%5)/4,0,Math.floor(i/5)/4);
 positions.setY(12,8);positions.setY(6,3);
 const grid=[0,.25,.5,.75,1];
 // Boundaries have zero elevation; the internal peak must still determine the floor.
 const full:MapPolygon=[[[0,0],[1,0],[1,1],[0,1]]];
 expect(mappedFoundation3D(full,grid,geometry,{x:0,z:0},()=>0)).toEqual({floor:8,bottom:0});
 const hole:MapPolygon=[full[0],[[.4,.4],[.6,.4],[.6,.6],[.4,.6]]];
 const foundation=mappedFoundation3D(hole,grid,geometry,{x:0,z:0},()=>0);
 // The central peak is in a courtyard, but its sloping triangle edges enter the building.
 expect(foundation.floor).toBeCloseTo(4.8);
 expect(foundation.bottom).toBe(0);
 geometry.dispose();
});

test("fullscreen backdrop extends through the unchanged SVG screen transform",()=>{
 const matrix={a:.6,b:0,c:0,d:.6,e:638,f:452};
 const bounds=mapScreenBounds2D(matrix,1316,855)!;
 expect(bounds.minX*matrix.a+matrix.e).toBeCloseTo(0);
 expect(bounds.maxX*matrix.a+matrix.e).toBeCloseTo(1316);
 expect(bounds.minY*matrix.d+matrix.f).toBeCloseTo(0);
 expect(bounds.maxY*matrix.d+matrix.f).toBeCloseTo(855);
 // A point on the course retains exactly the original screen location.
 const point=[-400,120];expect(point[0]*matrix.a+matrix.e).toBe(398);expect(point[1]*matrix.d+matrix.f).toBe(524);
 expect(mapScreenBounds2D({...matrix,a:0,d:0},1316,855)).toBeUndefined();
});
