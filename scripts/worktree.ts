import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

// Gitignored files a worktree needs from the main checkout; `.worktreeinclude` lists the same.
export const WORKTREE_FILES = [
  ".env",
  ".dev-user.json",
  ".dev-authentik-groups.json",
];

const MAX_IDENTIFIER_BYTES = 63;

function git(cwd: string, ...args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function mainCheckoutOf(cwd: string): string | null {
  const gitDir = git(cwd, "rev-parse", "--path-format=absolute", "--git-dir");
  const commonDir = git(
    cwd,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  );
  if (!gitDir || !commonDir) return null;
  if (path.resolve(gitDir) === path.resolve(commonDir)) return null;
  return path.dirname(path.resolve(commonDir));
}

export function worktreeRoot(cwd: string): string | null {
  const root = git(cwd, "rev-parse", "--show-toplevel");
  return root ? path.resolve(root) : null;
}

export function worktreeRoots(cwd: string): string[] {
  const porcelain = git(cwd, "worktree", "list", "--porcelain") ?? "";
  return porcelain
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length)));
}

export function worktreeKey(
  worktreeRoot: string,
  mainCheckout: string,
): string {
  const relative = path.relative(
    path.join(mainCheckout, ".claude", "worktrees"),
    worktreeRoot,
  );
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  return path.basename(worktreeRoot);
}

export function databaseName(key: string, prefix: string): string {
  const name = `${prefix}${key}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (Buffer.byteLength(name) <= MAX_IDENTIFIER_BYTES) return name;
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${name.slice(0, MAX_IDENTIFIER_BYTES - hash.length - 1)}_${hash}`;
}

export function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

export function setEnvValue(text: string, key: string, value: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);
  // Lead (optional `export`, the key, `=`), a quoted or bare value, then whatever follows it.
  const keyLine = new RegExp(
    `^(\\s*(?:export\\s+)?${key}\\s*=\\s*)(?:(["'])(?:.*?)\\2|[^\\s#]*)(.*)$`,
  );
  const index = lines.findIndex((line) => keyLine.test(line));
  if (index === -1) {
    const body = text === "" || text.endsWith(eol) ? text : `${text}${eol}`;
    return `${body}${key}="${value}"${eol}`;
  }
  const [, lead, quote = "", rest] = lines[index].match(keyLine) ?? [];
  lines[index] = `${lead}${quote}${value}${quote}${rest}`;
  return lines.join(eol);
}

export function staleDatabases(
  existing: string[],
  prefix: string,
  live: string[],
): string[] {
  return existing.filter(
    (name) => name.startsWith(prefix) && !live.includes(name),
  );
}
