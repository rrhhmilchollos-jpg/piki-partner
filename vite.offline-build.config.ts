import { fileURLToPath } from "node:url";
import { mergeConfig, defineConfig } from "vite";
import existing from "./vite.config.ts";

export default mergeConfig(existing, defineConfig({
  // Compile only; never load production .env or run prepare-release.
  envDir: fileURLToPath(new URL("./.offline-empty-env", import.meta.url)),
  build: { outDir: "dist-offline" },
}));
