import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@gcp-sre/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/shared/src/**/*.test.ts",
      "apps/api/src/**/*.test.ts",
    ],
    /** Unit tests must not hit live GCP / Vertex. */
    env: {
      MODE: "local",
      REACT: "off",
      PAGING: "off",
      STORE_BACKEND: "memory",
    },
  },
});
