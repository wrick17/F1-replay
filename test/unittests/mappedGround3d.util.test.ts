import { expect, test } from "bun:test";
import { Mesh, MeshStandardMaterial, PlaneGeometry, Scene } from "three/webgpu";
import type { CircuitSurroundings, MapPolygon } from "../../src/modules/replay/types/circuitSurroundings.types";
import { MAP_COLORS, mapContainsPoint } from "../../src/modules/replay/utils/circuitMapGeometry.util";
import { createMappedGround3D } from "../../src/modules/replay/utils/mappedGround3d.util";
import {
  createMappedWorld3D,
  mappedBuildingBlocksCircuit3D,
} from "../../src/modules/replay/utils/mappedWorld3d.util";

const fixture = () => {
  const grid = [0, .25, 1], center = {x: 2, z: 3};
  const ground = new PlaneGeometry(1, 1, 2, 2);
  const p = ground.getAttribute("position");
  for(let i=0;i<p.count;i++)p.setXYZ(i,grid[i%3],i===4?.8:0,grid[Math.floor(i/3)]);
  ground.computeVertexNormals();
  const height = (x:number,z:number) => {
    const ix=x-2<.25?0:1, iz=z-3<.25?0:1;
    const fx=(x-2-grid[ix])/(grid[ix+1]-grid[ix]),fz=(z-3-grid[iz])/(grid[iz+1]-grid[iz]);
    const a=iz*3+ix,b=a+3,c=b+1,d=a+1;
    return fx+fz<=1?p.getY(a)+(p.getY(d)-p.getY(a))*fx+(p.getY(b)-p.getY(a))*fz:p.getY(c)+(p.getY(b)-p.getY(c))*(1-fx)+(p.getY(d)-p.getY(c))*(1-fz);
  };
  return {grid,center,ground,height};
};

test("vector polygons preserve holes, area, upward faces and every interior terrain triangle",()=>{
  const {grid,center,ground,height}=fixture();
  const polygon:MapPolygon=[[[2,3],[3,3],[3,4],[2,4],[2,3]],[[2.4,3.4],[2.8,3.4],[2.8,3.8],[2.4,3.8],[2.4,3.4]]];
  const builder=createMappedGround3D(ground,grid,center,.5);
  builder.polygon(polygon,"#fff",0);
  let area=0,peak=0;
  for(const {geometry} of builder.finish()){
    const p=geometry.getAttribute("position");
    for(let i=0;i<p.count;i+=3){
      const cross=(p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i));
      expect(cross).toBeLessThan(0);area-=cross/2;
      const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
      const y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;
      expect(mapContainsPoint([x,z],polygon)).toBe(true);
      expect(y).toBeCloseTo(height(x,z),5);
      for(let j=i;j<i+3;j++){
        expect(p.getY(j)).toBeCloseTo(height(p.getX(j),p.getZ(j)),5);
        peak=Math.max(peak,p.getY(j));
      }
    }
    geometry.dispose();
  }
  expect(area).toBeCloseTo(.84,5);expect(peak).toBeCloseTo(.8,5);ground.dispose();
});

test("vector roads retain metric width and round caps without canvas",()=>{
 const {grid,center,ground}=fixture();
 const builder=createMappedGround3D(ground,grid,center,2);
 builder.road([[2.2,3.5],[2.8,3.5]],.1,"#fff",5);
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const {geometry} of builder.finish()){
  const p=geometry.getAttribute("position");
  for(let i=0;i<p.count;i++){minX=Math.min(minX,p.getX(i));maxX=Math.max(maxX,p.getX(i));minZ=Math.min(minZ,p.getZ(i));maxZ=Math.max(maxZ,p.getZ(i));}
  geometry.dispose();
 }
 expect(minX).toBeCloseTo(2.15,5);expect(maxX).toBeCloseTo(2.85,5);expect(minZ).toBeCloseTo(3.45,5);expect(maxZ).toBeCloseTo(3.55,5);ground.dispose();
});

test("mapped world suppresses the matched raceway and tunnels and needs no raster canvas",()=>{
 const {grid,center,ground,height}=fixture();
 const data:CircuitSurroundings={schemaVersion:1,circuitKey:46,geometry:{sha256:"",anchors:[],referencePlanarLengthRaw:1},source:{snapshotAt:"",url:"",attribution:""},metersToWorld:.001,coverage:[[[2,3],[3,3],[3,4],[2,4]]],areas:[],buildings:[],roads:[{id:"race",kind:"raceway",points:[[2.2,3.5],[2.8,3.5]]},{id:"tunnel",kind:"road",tunnel:true,points:[[2.2,3.6],[2.8,3.6]]}]};
 const scene=new Scene();
 expect(createMappedWorld3D(scene,data,ground,center,height,()=>0,.01,grid,1).groundTriangleCount).toBe(0);
 data.roads.push({id:"local",kind:"road",points:[[2.2,3.7],[2.8,3.7]],widthM:5});
 const mapped=createMappedWorld3D(scene,data,ground,center,height,()=>1,.01,grid,1);
 expect(mapped.groundTriangleCount).toBeGreaterThan(0);expect(mapped.streetLightCount).toBeGreaterThan(0);
 expect(mapped.cityLights).toHaveLength(mapped.streetLightCount);
 expect(mapped.cityLights.every(light=>light.distance>0&&light.intensity===0)).toBe(true);ground.dispose();
});

test("overlapping vector classes share terrain depth and deterministic decal priority",()=>{
 const {grid,center,ground,height}=fixture();
 const polygon:MapPolygon=[[[2.2,3.2],[2.8,3.2],[2.8,3.8],[2.2,3.8]]];
 const data:CircuitSurroundings={schemaVersion:1,circuitKey:46,geometry:{sha256:"",anchors:[],referencePlanarLengthRaw:1},source:{snapshotAt:"",url:"",attribution:""},metersToWorld:.001,coverage:polygon,areas:["grass","wood","paved","parking","water"].map(kind=>({id:kind,kind:kind as CircuitSurroundings["areas"][number]["kind"],polygons:[polygon]})),roads:[{id:"road",kind:"road",points:[[2.2,3.5],[2.8,3.5]]}],buildings:[{id:"building",polygons:[polygon]}]};
 const scene=new Scene(),mapped=createMappedWorld3D(scene,data,ground,center,height,()=>1,.01,grid,1);
 expect(mapped.windowCount).toBeGreaterThan(0);expect(mapped.windowMaterial?.opacity).toBe(0);
 const orders=new Set<number>();let water:Mesh|undefined;
 for(const child of scene.children){
  if(!(child instanceof Mesh)||child.renderOrder===0)continue;
  orders.add(child.renderOrder);
  const material=child.material as MeshStandardMaterial;
  if(material.color.getHexString()===MAP_COLORS.water.slice(1))water=child;
  expect(material.depthTest).toBe(true);expect(material.depthWrite).toBe(false);
  expect(material.polygonOffset).toBe(true);expect(material.polygonOffsetFactor).toBe(-1);expect(material.polygonOffsetUnits).toBe(-1);
  const p=child.geometry.getAttribute("position");
  for(let i=0;i<p.count;i++)expect(p.getY(i)).toBeCloseTo(height(p.getX(i),p.getZ(i)),5);
 }
 expect([...orders].sort()).toEqual([1,2,3,4,5,6,7]);ground.dispose();
 expect(water).toBeDefined();
 expect(water!.geometry.hasAttribute("uv")).toBe(true);
 const waterMaterial=water!.material as MeshStandardMaterial;
 expect(waterMaterial.roughness).toBe(.42);expect(waterMaterial.metalness).toBe(0);
 expect(waterMaterial.bumpScale).toBe(.00012);expect(waterMaterial.bumpMap?.image.width).toBe(128);
 mapped.dispose();
});

test("mapped buildings leave the whole road corridor clear while preserving overheads", () => {
  const building = (minHeightM?: number): CircuitSurroundings["buildings"][number] => ({
    id: "test",
    polygons: [],
    ...(minHeightM === undefined ? {} : { minHeightM }),
  });
  const rectangle = (minX: number, minZ: number, maxX: number, maxZ: number): MapPolygon => [
    [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ],
  ];
  const track = [[{ x: -2, z: 0 }, { x: 2, z: 0 }]];
  expect(
    mappedBuildingBlocksCircuit3D(building(), rectangle(-0.01, -1, 0.01, 1), track, 0.001),
  ).toBe(true);
  expect(
    mappedBuildingBlocksCircuit3D(building(), rectangle(-0.5, 0.08, 0.5, 0.2), track, 0.1),
  ).toBe(true);
  expect(
    mappedBuildingBlocksCircuit3D(building(), rectangle(-0.5, 0.11, 0.5, 0.2), track, 0.1),
  ).toBe(false);
  expect(
    mappedBuildingBlocksCircuit3D(building(), rectangle(-3, -1, 3, 1), track, 0.001),
  ).toBe(true);
  const nearParallel: MapPolygon = [
    [
      [0, 0.0002],
      [0.001, 0.0012],
      [0.0011, 0.0013],
      [0.0001, 0.0003],
    ],
  ];
  expect(
    mappedBuildingBlocksCircuit3D(
      building(),
      nearParallel,
      [[{ x: 0, z: 0 }, { x: 0.001, z: 0.001 }]],
      0.00005,
    ),
  ).toBe(false);
  expect(
    mappedBuildingBlocksCircuit3D(building(4.5), rectangle(-0.1, -1, 0.1, 1), track, 0.1),
  ).toBe(false);
  const courtyard: MapPolygon = [
    rectangle(-2, -2, 2, 2)[0],
    rectangle(-1, -1, 1, 1)[0],
  ];
  expect(
    mappedBuildingBlocksCircuit3D(
      building(),
      courtyard,
      [[{ x: -0.5, z: 0 }, { x: 0.5, z: 0 }]],
      0.1,
    ),
  ).toBe(false);
  expect(
    mappedBuildingBlocksCircuit3D(
      building(),
      rectangle(-0.2, -0.2, 0.2, 0.2),
      [
        [
          { x: -2, z: -2 },
          { x: -1, z: -2 },
        ],
        [
          { x: 1, z: 2 },
          { x: 2, z: 2 },
        ],
      ],
      0.1,
    ),
  ).toBe(false);
});
