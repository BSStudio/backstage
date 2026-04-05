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
      exclude: [
        "app/api/auth/**",
        "app/generated/**",
        "lib/auth.ts",
        "lib/auth-client.ts",
        "lib/prisma.ts",
        "lib/utils.ts",
      ],
    },
  },
});
