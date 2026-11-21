const repoUrl = "https://github.com/BSStudio/backstage";

// Tag builds are versioned X.Y.Z, other images 0.0.0+<commit>, local builds dev.
export function releaseLink(version: string): { label: string; url: string } {
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    return { label: `v${version}`, url: `${repoUrl}/releases/tag/v${version}` };
  }
  const commit = version.split("+")[1];
  if (commit) return { label: commit, url: `${repoUrl}/commit/${commit}` };
  return { label: version, url: repoUrl };
}
