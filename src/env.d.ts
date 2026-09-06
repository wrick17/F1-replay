declare global {
  interface ImportMetaEnv {
    readonly RSBUILD_WORKER_URL?: string;
    readonly VITE_WORKER_URL?: string;
    readonly RSBUILD_CAR_TELEMETRY_WORKER_URL?: string;
    readonly RSBUILD_ARCHIVE_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
