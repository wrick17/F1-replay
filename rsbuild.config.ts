import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import path from "node:path";

const rootDir = path.resolve(__dirname);

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: "./public/index.html",
  },
  source: {
    entry: {
      index: "./src/index.tsx",
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
