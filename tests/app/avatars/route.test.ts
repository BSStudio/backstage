import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAvatar } = vi.hoisted(() => ({
  mockGetAvatar: vi.fn(),
}));

vi.mock("@/lib/avatar-storage", () => ({
  getAvatar: mockGetAvatar,
}));

beforeEach(() => {
  mockGetAvatar.mockReset();
});

function makeReq(p: string) {
  return new NextRequest(new URL(p, "http://localhost"));
}

function makeParams(parts: string[]) {
  return { params: Promise.resolve({ path: parts }) };
}

describe("GET /avatars/[...path]", () => {
  it("streams body with image/webp and no-cache headers", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    mockGetAvatar.mockResolvedValueOnce({
      body: bytes,
      contentType: "image/webp",
    });

    const { GET } = await import("@/app/avatars/[...path]/route");
    const res = await GET(
      makeReq("/avatars/abc-square.webp"),
      makeParams(["abc-square.webp"]),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf).toEqual(bytes);
  });

  it("returns 404 when storage returns null", async () => {
    mockGetAvatar.mockResolvedValueOnce(null);

    const { GET } = await import("@/app/avatars/[...path]/route");
    const res = await GET(
      makeReq("/avatars/missing.webp"),
      makeParams(["missing.webp"]),
    );

    expect(res.status).toBe(404);
    expect(mockGetAvatar).toHaveBeenCalledWith("missing.webp");
  });

  it("returns 404 for nested paths (directory traversal not allowed)", async () => {
    const { GET } = await import("@/app/avatars/[...path]/route");
    const res = await GET(
      makeReq("/avatars/foo/bar.webp"),
      makeParams(["foo", "bar.webp"]),
    );

    expect(res.status).toBe(404);
    expect(mockGetAvatar).not.toHaveBeenCalled();
  });
});
