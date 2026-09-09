import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import {
  Fn,
  interleavedGradientNoise,
  lights,
  pass,
  screenCoordinate,
  screenUV,
  uniform,
} from "three/tsl";
import {
  BoxGeometry,
  Mesh,
  type PerspectiveCamera,
  RenderPipeline,
  Scene,
  type SpotLight,
  type Vector3,
  VolumeNodeMaterial,
  type WebGPURenderer,
} from "three/webgpu";
import type { ReplayEnvironment } from "./replayEnvironment.util";

export const replayVolumetricState3D = (environment: ReplayEnvironment) => {
  const angle = ((environment.localHour - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const daylight = Math.max(0, Math.min(1, (elevation + 0.12) / 0.34));
  const smoothDaylight = daylight * daylight * (3 - 2 * daylight);
  const night = 1 - smoothDaylight;
  const humidity = Math.max(0, Math.min(1, environment.humidity / 100));
  const atmosphericDensity =
    6 + humidity * 4 + environment.cloudCover * 3 + environment.rainfall * 10;

  return {
    active: night > 0.08,
    density: night * atmosphericDensity,
  };
};

export const createReplayVolumetricLighting3D = ({
  scene,
  camera,
  renderer,
  span,
  spotLights,
}: {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGPURenderer;
  span: number;
  spotLights: readonly SpotLight[];
}) => {
  const density = uniform(0);
  const material = new VolumeNodeMaterial();
  const isWebGPU = "isWebGPUBackend" in renderer.backend && renderer.backend.isWebGPUBackend;
  material.steps = isWebGPU ? 6 : 4;
  material.offsetNode = interleavedGradientNoise(screenCoordinate);
  material.scatteringNode = Fn(() => density);
  material.lightsNode = lights([...spotLights]);

  const geometry = new BoxGeometry(1, 1, 1);
  const volume = new Mesh(geometry, material);
  volume.frustumCulled = false;

  // A separate scene gives the volume pass a transparent background. The main
  // pass updates the shared spotlight shadow maps against the full world first.
  const volumeScene = new Scene();
  volumeScene.add(volume);

  const scenePass = pass(scene, camera);
  material.depthNode = scenePass.getTextureNode("depth").sample(screenUV);
  const volumePass = pass(volumeScene, camera, { depthBuffer: false });
  volumePass.name = "Replay volumetric lighting";
  volumePass.setResolutionScale(0.125);
  const blurredVolume = gaussianBlur(volumePass, uniform(0.6));
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = scenePass.add(blurredVolume);

  let active = false;
  return {
    update: (environment: ReplayEnvironment, focus: Vector3) => {
      const state = replayVolumetricState3D(environment);
      active = state.active;
      density.value = state.density;

      const contributing = spotLights.filter((light) => light.intensity > 0);
      let minX = focus.x,
        maxX = focus.x,
        minY = focus.y,
        maxY = focus.y,
        minZ = focus.z,
        maxZ = focus.z;
      for (const light of contributing) {
        minX = Math.min(minX, light.position.x, light.target.position.x);
        maxX = Math.max(maxX, light.position.x, light.target.position.x);
        minY = Math.min(minY, light.position.y, light.target.position.y);
        maxY = Math.max(maxY, light.position.y, light.target.position.y);
        minZ = Math.min(minZ, light.position.z, light.target.position.z);
        maxZ = Math.max(maxZ, light.position.z, light.target.position.z);
      }
      const horizontalPadding = Math.max(0.06, Math.min(0.09, span * 0.08));
      minX -= horizontalPadding;
      maxX += horizontalPadding;
      minZ -= horizontalPadding;
      maxZ += horizontalPadding;
      minY -= 0.012;
      maxY += 0.035;
      volume.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      volume.scale.set(maxX - minX, Math.max(0.09, maxY - minY), maxZ - minZ);
      volume.visible = active;
    },
    render: () => {
      if (active) pipeline.render();
      else renderer.render(scene, camera);
    },
    dispose: () => {
      pipeline.dispose();
      blurredVolume.dispose();
      volumePass.dispose();
      scenePass.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
};
