import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(__dirname);
const envPath = path.join(rootDir, ".env");

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      return;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(envPath);
const rsbuildWorkerUrl = process.env.RSBUILD_WORKER_URL;
const viteWorkerUrl = process.env.VITE_WORKER_URL;

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: "./public/index.html",
  },
  source: {
    entry: {
      index: "./src/index.tsx",
    },
    define: {
      "import.meta.env.RSBUILD_WORKER_URL": rsbuildWorkerUrl
        ? JSON.stringify(rsbuildWorkerUrl)
        : "undefined",
      "import.meta.env.VITE_WORKER_URL": viteWorkerUrl
        ? JSON.stringify(viteWorkerUrl)
        : "undefined",
    },
  },
  resolve: {
    alias: {
      modules: path.join(rootDir, "src/modules"),
      common: path.join(rootDir, "src/common"),
      eureka: path.join(rootDir, "src/eureka"),
      host: path.join(rootDir, "src/host"),
    },
  },
  output: {
    distPath: {
      root: "dist",
    },
  },
  server: {
    strictPort: true,
    port: 3001,
    historyApiFallback: true,
  }
});
