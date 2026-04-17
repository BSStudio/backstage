import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMkdir, mockWriteFile, mockUnlink } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockUnlink: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  unlink: mockUnlink,
}));

import { deleteAvatars, saveAvatar } from "@/lib/avatar-storage";

// Minimal valid WebP: RIFF....WEBP + padding to 12 bytes
function makeWebP(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  buf.write("RIFF", 0);
  buf.write("WEBP", 8);
  return buf;
}

beforeEach(() => {
  vi.clearAllMocks();
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
