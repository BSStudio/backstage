import { execSync } from "node:child_process";
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
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
};

export default nextConfig;
