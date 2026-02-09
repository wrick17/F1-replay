interface ImportMetaEnv {
  readonly RSBUILD_WORKER_URL?: string;
  readonly VITE_WORKER_URL?: string;
}

// biome-ignore lint/correctness/noUnusedVariables: global ImportMeta augmentation
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
