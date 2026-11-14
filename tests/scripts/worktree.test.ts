import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  databaseName,
  mainCheckoutOf,
  setEnvValue,
  staleDatabases,
  withDatabase,
  worktreeKey,
  worktreeRoots,
} from "@/scripts/worktree";

describe("databaseName", () => {
  it("prefixes and replaces anything outside [a-z0-9] with underscores", () => {
    expect(databaseName("feature-auth", "backstage_")).toBe(
      "backstage_feature_auth",
    );
    expect(databaseName("Agent-Files", "backstage_")).toBe(
      "backstage_agent_files",
    );
  });

  it("keeps a nested branch path apart from its last segment", () => {
    expect(databaseName("feat/short-links", "backstage_")).toBe(
      "backstage_feat_short_links",
    );
  });

  it("fits Postgres's 63-byte limit with a stable hash suffix", () => {
    const long = databaseName("x".repeat(80), "backstage_");
    expect(Buffer.byteLength(long)).toBe(63);
    expect(long).toBe(databaseName("x".repeat(80), "backstage_"));
    expect(long).not.toBe(databaseName("x".repeat(81), "backstage_"));
  });
});

describe("worktreeKey", () => {
  it("is the path under .claude/worktrees, so nested branches stay distinct", () => {
    expect(worktreeKey("/r/.claude/worktrees/feat/short-links", "/r")).toBe(
      "feat/short-links",
    );
  });

  it("falls back to the folder name for a worktree elsewhere", () => {
    expect(worktreeKey("/elsewhere/agent-files", "/r")).toBe("agent-files");
  });
});

describe("withDatabase", () => {
  it("replaces only the database path", () => {
    expect(
      withDatabase(
        "postgresql://u:p@localhost:5583/backstage?schema=public",
        "backstage_x",
      ),
    ).toBe("postgresql://u:p@localhost:5583/backstage_x?schema=public");
  });
});

describe("setEnvValue", () => {
  it("rewrites one key and keeps quoting, other lines and CRLF endings", () => {
    expect(
      setEnvValue(
        'A=1\r\nDATABASE_URL="postgresql://h/backstage"\r\nB=2\r\n',
        "DATABASE_URL",
        "postgresql://h/backstage_x",
      ),
    ).toBe('A=1\r\nDATABASE_URL="postgresql://h/backstage_x"\r\nB=2\r\n');
  });

  it("appends a missing key", () => {
    expect(setEnvValue("A=1\n", "DATABASE_URL", "v")).toBe(
      'A=1\nDATABASE_URL="v"\n',
    );
  });
});

describe("staleDatabases", () => {
  it("lists only prefixed databases with no live worktree", () => {
    expect(
      staleDatabases(
        ["backstage", "backstage_a", "backstage_b", "postgres"],
        "backstage_",
        ["backstage_a"],
      ),
    ).toEqual(["backstage_b"]);
  });
});

describe("mainCheckoutOf", () => {
  let root: string;

  beforeAll(() => {
    root = realpathSync.native(
      mkdtempSync(path.join(tmpdir(), "worktree-test-")),
    );
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q", "-b", "main");
    writeFileSync(path.join(root, "README.md"), "x\n");
    git("add", "README.md");
    git(
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "commit",
      "-q",
      "-m",
      "init",
    );
    mkdirSync(path.join(root, ".claude", "worktrees"), { recursive: true });
    git(
      "worktree",
      "add",
      "-q",
      "-b",
      "w",
      path.join(".claude", "worktrees", "w"),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("is null in the main checkout", () => {
    expect(mainCheckoutOf(root)).toBeNull();
  });

  it("names the main checkout from inside a linked worktree", () => {
    const main = mainCheckoutOf(path.join(root, ".claude", "worktrees", "w"));
    expect(main && realpathSync.native(main)).toBe(root);
  });

  it("lists every worktree root, the main checkout included", () => {
    expect(worktreeRoots(root).map((dir) => realpathSync.native(dir))).toEqual([
      root,
      path.join(root, ".claude", "worktrees", "w"),
    ]);
  });
});
