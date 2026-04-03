interface ImportMetaEnv {
  readonly RSBUILD_WORKER_URL?: string;
  readonly VITE_WORKER_URL?: string;
  readonly RSBUILD_CAR_TELEMETRY_WORKER_URL?: string;
  readonly RSBUILD_CACHE_WARMER_URL?: string;
  readonly RSBUILD_ENABLE_REMOTE_CACHE_OPS?: string;
  readonly RSBUILD_ENABLE_REMOTE_CACHE_PROBES?: string;
}

// biome-ignore lint/correctness/noUnusedVariables: global ImportMeta augmentation
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
