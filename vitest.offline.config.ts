import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Intentionally absent directory: no project .env files are read.
  envDir: fileURLToPath(new URL("./.offline-empty-env", import.meta.url)),
  test: {
    environment: "node",
    setupFiles: ["./scripts/offline-test-setup.mjs"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
