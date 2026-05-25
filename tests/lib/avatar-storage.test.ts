import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMkdir, mockWriteFile, mockUnlink, mockReadFile } = vi.hoisted(
  () => ({
    mockMkdir: vi.fn(),
    mockWriteFile: vi.fn(),
    mockUnlink: vi.fn(),
    mockReadFile: vi.fn(),
  }),
);

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  unlink: mockUnlink,
  readFile: mockReadFile,
}));

import { deleteAvatars, getAvatar, saveAvatar } from "@/lib/avatar-storage";
import { resetAvatarStorageCache } from "@/lib/storage/factory";

// Minimal valid WebP: RIFF....WEBP + padding to 12 bytes
function makeWebP(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  buf.write("RIFF", 0);
  buf.write("WEBP", 8);
  return buf;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AVATAR_STORAGE;
  delete process.env.AVATAR_LOCAL_PATH;
  resetAvatarStorageCache();
});

describe("saveAvatar", () => {
  it("saves file and returns URL path", async () => {
    const buf = makeWebP();
    const url = await saveAvatar("abc-123", "square", buf);

    expect(url).toBe("/avatars/abc-123-square.webp");
    expect(mockMkdir).toHaveBeenCalledOnce();
    expect(mockWriteFile).toHaveBeenCalledOnce();
    expect(mockWriteFile.mock.calls[0][1]).toBe(buf);
  });

  it("returns correct path for portrait variant", async () => {
    const url = await saveAvatar("abc-123", "portrait", makeWebP());
    expect(url).toBe("/avatars/abc-123-portrait.webp");
  });

  it("rejects invalid member ID", async () => {
    await expect(saveAvatar("../etc", "square", makeWebP())).rejects.toThrow(
      "Invalid member ID",
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects ID with spaces", async () => {
    await expect(saveAvatar("has space", "square", makeWebP())).rejects.toThrow(
      "Invalid member ID",
    );
  });

  it("rejects oversized buffer", async () => {
    const buf = makeWebP(5 * 1024 * 1024 + 1);
    await expect(saveAvatar("abc-123", "square", buf)).rejects.toThrow(
      "File too large",
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("accepts buffer at exactly the size limit", async () => {
    const buf = makeWebP(5 * 1024 * 1024);
    await expect(saveAvatar("abc-123", "square", buf)).resolves.toBeDefined();
  });

  it("rejects non-WebP buffer", async () => {
    const buf = Buffer.from("not a webp image at all");
    await expect(saveAvatar("abc-123", "square", buf)).rejects.toThrow(
      "Invalid image format",
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects buffer too short for magic bytes", async () => {
    const buf = Buffer.alloc(8);
    buf.write("RIFF", 0);
    await expect(saveAvatar("abc-123", "square", buf)).rejects.toThrow(
      "Invalid image format",
    );
  });

  it("accepts IDs with underscores and hyphens", async () => {
    const url = await saveAvatar("abc_def-123", "square", makeWebP());
    expect(url).toBe("/avatars/abc_def-123-square.webp");
  });
});

describe("deleteAvatars", () => {
  it("deletes both square and portrait files", async () => {
    await deleteAvatars("abc-123");

    expect(mockUnlink).toHaveBeenCalledTimes(2);
    const paths = mockUnlink.mock.calls.map((c) => c[0] as string);
    expect(paths[0]).toContain("abc-123-square.webp");
    expect(paths[1]).toContain("abc-123-portrait.webp");
  });

  it("rejects invalid member ID", async () => {
    await expect(deleteAvatars("../../etc")).rejects.toThrow(
      "Invalid member ID",
    );
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("ignores missing files", async () => {
    mockUnlink.mockRejectedValue(new Error("ENOENT"));
    await expect(deleteAvatars("abc-123")).resolves.toBeUndefined();
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });
});

describe("getAvatar", () => {
  it("returns body and content type when file exists", async () => {
    const buf = makeWebP();
    mockReadFile.mockResolvedValueOnce(buf);

    const result = await getAvatar("abc-123-square.webp");

    expect(result).not.toBeNull();
    expect(result?.contentType).toBe("image/webp");
    expect(result && Buffer.from(result.body)).toEqual(buf);
  });

  it("returns null when file does not exist", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    const result = await getAvatar("abc-123-square.webp");
    expect(result).toBeNull();
  });

  it("rejects path traversal in filename", async () => {
    const result = await getAvatar("../etc/passwd");
    expect(result).toBeNull();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("rejects filenames not matching <id>-<variant>.webp", async () => {
    expect(await getAvatar("abc.webp")).toBeNull();
    expect(await getAvatar("abc-square.png")).toBeNull();
    expect(await getAvatar("abc-other.webp")).toBeNull();
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
