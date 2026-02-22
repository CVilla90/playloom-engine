import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@playloom/engine-core": resolve(rootDir, "packages/engine-core/src/index.ts"),
      "@playloom/engine-input": resolve(rootDir, "packages/engine-input/src/index.ts"),
      "@playloom/engine-renderer-canvas": resolve(rootDir, "packages/engine-renderer-canvas/src/index.ts"),
      "@playloom/engine-audio": resolve(rootDir, "packages/engine-audio/src/index.ts"),
      "@playloom/engine-assets": resolve(rootDir, "packages/engine-assets/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"]
  }
});
