import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from "three/webgpu";

export const replayWorldUvs3D = (positions: ArrayLike<number>, scale = 80) => {
  const uvs = new Float32Array((positions.length / 3) * 2);
  for (let source = 0, target = 0; source < positions.length; source += 3, target += 2) {
    uvs[target] = positions[source] * scale;
    uvs[target + 1] = positions[source + 2] * scale;
  }
  return uvs;
};

/** Tileable crossing waves break up broad water reflections without a downloaded normal map. */
export const createReplayWaterTexture3D = () => {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const waves =
        Math.sin(u * 3 + v * 2) * 0.48 +
        Math.sin(u * -2 + v * 5 + 1.1) * 0.31 +
        Math.sin(u * 7 - v + 0.7) * 0.21;
      const height = Math.round(128 + waves * 42);
      const index = (y * size + x) * 4;
      pixels.set([height, height, height, 255], index);
    }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

/** Small repeatable height tile gives asphalt close-up grain without an asset fetch. */
export const createReplayAsphaltTexture3D = () => {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 0x5f3759df;
  for (let index = 0; index < pixels.length; index += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const grain = 104 + ((seed >>> 24) * 48) / 255;
    pixels.set([grain, grain, grain, 255], index);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};
