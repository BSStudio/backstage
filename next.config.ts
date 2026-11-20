import { execFileSync } from "node:child_process";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

function git(...args: string[]) {
  return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
}

const commitHash = (() => {
  if (process.env.NEXT_PUBLIC_COMMIT_HASH)
    return process.env.NEXT_PUBLIC_COMMIT_HASH;
  try {
    return git("rev-parse", "--short", "HEAD");
  } catch {
    return "";
  }
})();

// Mirrors the "Resolve build metadata" step of .github/workflows/docker-publish.yml, which
// versions image builds.
const appVersion = (() => {
  if (process.env.NEXT_PUBLIC_APP_VERSION)
    return process.env.NEXT_PUBLIC_APP_VERSION;
  try {
    const describe = git(
      "describe",
      "--tags",
      "--first-parent",
      "--long",
      "--abbrev=7",
      "--match=v[0-9]*.[0-9]*.[0-9]*",
      "--exclude=*-*",
    );
    const match = /^v(\d+\.\d+\.\d+)-(\d+)-g([0-9a-f]+)$/.exec(describe);
    if (!match) return "dev";
    const [, tag, distance, hash] = match;

    if (distance === "0" && git("status", "--porcelain") === "") return tag;

    // Later commits must sort higher in Sentry, which compares the revision numerically and
    // prereleases as text.
    const branch = git("branch", "--show-current").replace(
      /[^0-9A-Za-z-]/g,
      "-",
    );
    return branch === "" || branch === "main"
      ? `${tag}.${distance}+${hash}`
      : `${tag}.${distance}+${branch}.${hash}`;
  } catch {
    return "dev";
  }
})();

// Release names are shared across the Sentry organization, hence the project slug.
const sentryRelease = `backstage@${appVersion}`;

const nextConfig: NextConfig = {
  output: "standalone",
  // WebDAV collections end in a slash, and Next's redirect fires before the proxy — so
  // `/api/carddav/` answered 308 instead of reaching it. Reinstated in `proxy.ts`.
  skipTrailingSlashRedirect: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
    NEXT_PUBLIC_SENTRY_RELEASE: sentryRelease,
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
    name: sentryRelease,
    create: Boolean(sentryAuthToken),
  },
});
