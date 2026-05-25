import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend, capturedConfig } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  capturedConfig: { current: null as unknown },
}));

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    constructor(config: unknown) {
      capturedConfig.current = config;
    }
    send = mockSend;
  }
  class MockCommand {
    constructor(public readonly input: unknown) {}
  }
  class PutObjectCommand extends MockCommand {}
  class GetObjectCommand extends MockCommand {}
  class DeleteObjectCommand extends MockCommand {}
  return {
    S3Client: MockS3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

import { S3AvatarStorage } from "@/lib/storage/s3";

beforeEach(() => {
  mockSend.mockReset();
  capturedConfig.current = null;
});

describe("S3AvatarStorage", () => {
  it("puts object with bucket, prefixed key, body, content type", async () => {
    const storage = new S3AvatarStorage("my-bucket", "avatars", {
      region: "us-east-1",
    });
    mockSend.mockResolvedValueOnce({});

    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    await storage.put("abc-123-square.webp", buf, "image/webp");

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input).toEqual({
      Bucket: "my-bucket",
      Key: "avatars/abc-123-square.webp",
      Body: buf,
      ContentType: "image/webp",
    });
  });

  it("strips leading and trailing slashes from prefix", async () => {
    const storage = new S3AvatarStorage("bucket", "/avatars/", {
      region: "us-east-1",
    });
    mockSend.mockResolvedValueOnce({});
    await storage.put("foo.webp", Buffer.alloc(0), "image/webp");
    expect(mockSend.mock.calls[0][0].input.Key).toBe("avatars/foo.webp");
  });

  it("omits prefix path when prefix is empty", async () => {
    const storage = new S3AvatarStorage("bucket", "", {
      region: "us-east-1",
    });
    mockSend.mockResolvedValueOnce({});
    await storage.put("foo.webp", Buffer.alloc(0), "image/webp");
    expect(mockSend.mock.calls[0][0].input.Key).toBe("foo.webp");
  });

  it("removes object via DeleteObjectCommand", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    mockSend.mockResolvedValueOnce({});

    await storage.remove("abc-123-square.webp");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0].input).toEqual({
      Bucket: "bucket",
      Key: "avatars/abc-123-square.webp",
    });
  });

  it("fetches object and returns body + content type", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    const bytes = new Uint8Array([1, 2, 3]);
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
      ContentType: "image/webp",
    });

    const result = await storage.fetch("abc.webp");

    expect(result).toEqual({ body: bytes, contentType: "image/webp" });
  });

  it("returns null when object missing (NoSuchKey error name)", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    const err = new Error("missing") as Error & { name: string };
    err.name = "NoSuchKey";
    mockSend.mockRejectedValueOnce(err);

    expect(await storage.fetch("missing.webp")).toBeNull();
  });

  it("returns null when object missing (404 status code)", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    const err = Object.assign(new Error("not found"), {
      $metadata: { httpStatusCode: 404 },
    });
    mockSend.mockRejectedValueOnce(err);

    expect(await storage.fetch("missing.webp")).toBeNull();
  });

  it("rethrows other errors", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    const err = Object.assign(new Error("boom"), {
      $metadata: { httpStatusCode: 500 },
    });
    mockSend.mockRejectedValueOnce(err);

    await expect(storage.fetch("foo.webp")).rejects.toThrow("boom");
  });

  it("rethrows when error has neither name nor Code nor 404 metadata", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    mockSend.mockRejectedValueOnce({ message: "unknown" });

    await expect(storage.fetch("foo.webp")).rejects.toEqual({
      message: "unknown",
    });
  });

  it("returns null when error has legacy SDK v2 Code field (no name)", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    mockSend.mockRejectedValueOnce({ Code: "NoSuchKey" });

    expect(await storage.fetch("missing.webp")).toBeNull();
  });

  it("returns null when Body is undefined", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    mockSend.mockResolvedValueOnce({ ContentType: "image/webp" });

    expect(await storage.fetch("foo.webp")).toBeNull();
  });

  it("falls back to image/webp when ContentType missing", async () => {
    const storage = new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
    });
    const bytes = new Uint8Array([1]);
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
    });

    const result = await storage.fetch("foo.webp");
    expect(result).toEqual({ body: bytes, contentType: "image/webp" });
  });
});

describe("S3AvatarStorage constructor options", () => {
  it("passes endpoint to S3Client when set", () => {
    new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
      endpoint: "https://minio.local:9000",
    });
    expect(capturedConfig.current).toMatchObject({
      endpoint: "https://minio.local:9000",
    });
  });

  it("omits endpoint when not set", () => {
    new S3AvatarStorage("bucket", "avatars", { region: "us-east-1" });
    const cfg = capturedConfig.current as Record<string, unknown>;
    expect(cfg.endpoint).toBeUndefined();
  });

  it("passes forcePathStyle when true", () => {
    new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
      forcePathStyle: true,
    });
    expect(capturedConfig.current).toMatchObject({ forcePathStyle: true });
  });

  it("omits forcePathStyle when false", () => {
    new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
      forcePathStyle: false,
    });
    const cfg = capturedConfig.current as Record<string, unknown>;
    expect(cfg.forcePathStyle).toBeUndefined();
  });

  it("passes explicit credentials when both keys set", () => {
    new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "secret",
    });
    expect(capturedConfig.current).toMatchObject({
      credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
    });
  });

  it("omits credentials when only one key set", () => {
    new S3AvatarStorage("bucket", "avatars", {
      region: "us-east-1",
      accessKeyId: "AKIA",
    });
    const cfg = capturedConfig.current as Record<string, unknown>;
    expect(cfg.credentials).toBeUndefined();
  });
});
