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
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
  images: {
    localPatterns: [{ pathname: "/avatars/**" }],
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
  sourcemaps: {
    disable: !sentryAuthToken,
    deleteSourcemapsAfterUpload: true,
  },
  release: {
    name: appVersion,
    create: Boolean(sentryAuthToken),
  },
});
