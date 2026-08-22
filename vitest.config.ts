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
    reporters: [
      "default",
      // Has no env guard of its own: it would emit ::error commands locally too.
      ...(process.env.GITHUB_ACTIONS === "true"
        ? (["github-actions"] as const)
        : []),
      ["junit", { outputFile: "test-results/junit.xml" }],
    ],
    coverage: {
      reporter: ["text", "html", "lcov"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
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
