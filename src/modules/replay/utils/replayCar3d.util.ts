import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  type BufferGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from "three/webgpu";

export const REPLAY_CAR_MODEL_URL = "/models/rmgt-toon-f1-remix.stl";

export function prepareReplayCarGeometry(geometry: BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const groups: number[][] = [[], []];
  // The supplied STL has no materials. Its four wheels are centered at X=103/141,
  // outside Y=105 +/- 7.2. Paint the body in the team color and keep tires black.
  for (let index = 0; index < positions.count; index += 3) {
    const x = (positions.getX(index) + positions.getX(index + 1) + positions.getX(index + 2)) / 3;
    const y = (positions.getY(index) + positions.getY(index + 1) + positions.getY(index + 2)) / 3;
    const z = (positions.getZ(index) + positions.getZ(index + 1) + positions.getZ(index + 2)) / 3;
    const wheel =
      Math.abs(y - 105) > 7.2 &&
      Math.hypot(Math.min(Math.abs(x - 103.004), Math.abs(x - 140.954)), z - 5) < 6.2;
    groups[wheel ? 1 : 0].push(index, index + 1, index + 2);
  }
  geometry.setIndex(groups.flat());
  geometry.clearGroups();
  let offset = 0;
  groups.forEach((indices, materialIndex) => {
    geometry.addGroup(offset, indices.length, materialIndex);
    offset += indices.length;
  });
  // Source +X is the nose and +Z is up. Replay uses +Z forward and +Y up.
  // Preserve its proportions at the previous car length, before the view's 0.1 scale.
  const scale = 0.118 / 60;
  geometry.applyMatrix4(
    new Matrix4().set(
      0,
      scale,
      0,
      -105 * scale,
      0,
      0,
      scale,
      0,
      scale,
      0,
      0,
      -125 * scale,
      0,
      0,
      0,
      1,
    ),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.sharedReplayCarResource = true;
  return geometry;
}

export async function loadReplayCarModel3D() {
  const geometry = prepareReplayCarGeometry(await new STLLoader().loadAsync(REPLAY_CAR_MODEL_URL));
  const tireMaterial = new MeshStandardMaterial({ color: 0x080a0c, roughness: 0.96 });
  tireMaterial.userData.sharedReplayCarResource = true;
  return {
    createCar(driverNumber: number, color: string, label: string) {
      const car = new Group();
      car.userData.driverNumber = driverNumber;
      const bodyMaterial = new MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.28 });
      car.userData.bodyMaterial = bodyMaterial;
      const mesh = new Mesh(geometry, [bodyMaterial, tireMaterial]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.driverNumber = driverNumber;
      car.add(mesh);

      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "rgba(7, 11, 17, 0.88)";
        context.fillRect(2, 2, 188, 60);
        context.fillStyle = color;
        context.fillRect(2, 56, 188, 6);
        context.fillStyle = "#ffffff";
        context.font = "700 32px ui-sans-serif, system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(label.slice(0, 3).toUpperCase(), 96, 30);
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        const caption = new Sprite(
          new SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
          }),
        );
        caption.position.y = 0.2;
        caption.scale.set(0.5, 0.167, 1);
        caption.renderOrder = 20;
        caption.userData.driverNumber = driverNumber;
        car.userData.caption = caption;
        car.add(caption);
      }
      car.scale.setScalar(0.1);
      return car;
    },
    dispose() {
      geometry.dispose();
      tireMaterial.dispose();
    },
  };
}
