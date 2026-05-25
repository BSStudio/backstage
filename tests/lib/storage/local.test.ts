import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMkdir, mockReadFile, mockUnlink, mockWriteFile } = vi.hoisted(
  () => ({
    mockMkdir: vi.fn(),
    mockReadFile: vi.fn(),
    mockUnlink: vi.fn(),
    mockWriteFile: vi.fn(),
  }),
);

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  readFile: mockReadFile,
  unlink: mockUnlink,
  writeFile: mockWriteFile,
}));

import { LocalAvatarStorage } from "@/lib/storage/local";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LocalAvatarStorage path traversal guard", () => {
  const storage = new LocalAvatarStorage("./storage/avatars");

  it("rejects ../ traversal on put", async () => {
    await expect(
      storage.put("../escape.webp", Buffer.alloc(0), "image/webp"),
    ).rejects.toThrow("Invalid file path");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects ../ traversal on remove", async () => {
    await expect(storage.remove("../escape.webp")).rejects.toThrow(
      "Invalid file path",
    );
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("rejects ../ traversal on fetch", async () => {
    await expect(storage.fetch("../escape.webp")).rejects.toThrow(
      "Invalid file path",
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("accepts plain filenames", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(storage.fetch("abc-square.webp")).resolves.toBeNull();
    expect(mockReadFile).toHaveBeenCalledOnce();
  });
});
