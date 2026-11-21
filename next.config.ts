import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

// The Dockerfile sets it from its VERSION build arg.
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

// Release names are shared across the Sentry organization, hence the project slug.
const sentryRelease = `backstage@${appVersion}`;

const nextConfig: NextConfig = {
  output: "standalone",
  // WebDAV collections end in a slash, and Next's redirect fires before the proxy — so
  // `/api/carddav/` answered 308 instead of reaching it. Reinstated in `proxy.ts`.
  skipTrailingSlashRedirect: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
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
