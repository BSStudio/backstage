import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(public readonly config: unknown) {}
    send = vi.fn();
  },
  PutObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
}));

const ENV_KEYS = [
  "AVATAR_STORAGE",
  "AVATAR_LOCAL_PATH",
  "S3_BUCKET",
  "S3_REGION",
  "S3_PREFIX",
  "S3_ENDPOINT",
  "S3_FORCE_PATH_STYLE",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  const { resetAvatarStorageCache } = await import("@/lib/storage/factory");
  resetAvatarStorageCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("avatarStorage factory", () => {
  it("defaults to local backend", async () => {
    const { LocalAvatarStorage } = await import("@/lib/storage/local");
    const { avatarStorage } = await import("@/lib/storage/factory");
    expect(avatarStorage()).toBeInstanceOf(LocalAvatarStorage);
  });

  it("returns S3 backend when AVATAR_STORAGE=s3", async () => {
    process.env.AVATAR_STORAGE = "s3";
    process.env.S3_BUCKET = "my-bucket";
    process.env.S3_REGION = "us-east-1";

    const { S3AvatarStorage } = await import("@/lib/storage/s3");
    const { avatarStorage } = await import("@/lib/storage/factory");
    expect(avatarStorage()).toBeInstanceOf(S3AvatarStorage);
  });

  it("throws when S3_BUCKET missing for s3 backend", async () => {
    process.env.AVATAR_STORAGE = "s3";
    process.env.S3_REGION = "us-east-1";

    const { avatarStorage } = await import("@/lib/storage/factory");
    expect(() => avatarStorage()).toThrow("S3_BUCKET is required");
  });

  it("throws when S3_REGION missing for s3 backend", async () => {
    process.env.AVATAR_STORAGE = "s3";
    process.env.S3_BUCKET = "my-bucket";

    const { avatarStorage } = await import("@/lib/storage/factory");
    expect(() => avatarStorage()).toThrow("S3_REGION is required");
  });

  it("throws on unknown backend", async () => {
    process.env.AVATAR_STORAGE = "ftp";

    const { avatarStorage } = await import("@/lib/storage/factory");
    expect(() => avatarStorage()).toThrow("Unknown AVATAR_STORAGE backend");
  });

  it("caches backend across calls", async () => {
    const { avatarStorage } = await import("@/lib/storage/factory");
    expect(avatarStorage()).toBe(avatarStorage());
  });
});
