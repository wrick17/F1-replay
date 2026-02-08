interface ImportMetaEnv {
  readonly RSBUILD_WORKER_URL?: string;
  readonly VITE_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
