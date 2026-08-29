import { execSync } from "node:child_process";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const commitHash = (() => {
  if (process.env.NEXT_PUBLIC_COMMIT_HASH)
    return process.env.NEXT_PUBLIC_COMMIT_HASH;
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "";
  }
})();

const appVersion = (() => {
  if (process.env.NEXT_PUBLIC_APP_VERSION)
    return process.env.NEXT_PUBLIC_APP_VERSION;
  if (!commitHash) return "dev";
  try {
    const tag = execSync("git describe --tags --exact-match HEAD", {
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return `${tag}-${commitHash}`;
  } catch {
    return `dev-${commitHash}`;
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  // WebDAV collections end in a slash, and Next's redirect fires before the proxy — so
  // `/api/carddav/` answered 308 instead of reaching it. Reinstated in `proxy.ts`.
  skipTrailingSlashRedirect: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
  images: {
    localPatterns: [{ pathname: "/avatars/**" }],
  },
  // The tracer copies @swc/helpers' `cjs/` half, but Node 24 resolves the package's
  // `module-sync` export to `esm/` — without this the standalone server dies on boot.
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*",
      "node_modules/@swc/helpers/esm/**/*",
    ],
  },
};

// Upload is off without the build secret, so a local `pnpm build` still succeeds.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  // Proxy events through our own origin so ad blockers cannot drop them by hostname.
  tunnelRoute: "/monitoring",
  sourcemaps: {
    disable: !sentryAuthToken,
    deleteSourcemapsAfterUpload: true,
  },
  release: {
    name: appVersion,
    create: Boolean(sentryAuthToken),
  },
});
