import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      include: ["app/**/*.ts", "lib/**/*.ts", "types/**/*.ts"],
    },
  },
});
