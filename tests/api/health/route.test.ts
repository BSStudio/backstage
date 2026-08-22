import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { $queryRaw: mockQueryRaw },
}));

beforeEach(() => {
  mockQueryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/health", () => {
  it("returns 200 when the database answers", async () => {
    const { GET } = await import("@/app/api/health/route");

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("ECONNREFUSED db:5432"));
    const { GET } = await import("@/app/api/health/route");

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ status: "error" });
  });

  it("keeps the database error out of the unauthenticated body", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("ECONNREFUSED db:5432"));
    const { GET } = await import("@/app/api/health/route");

    const res = await GET();

    await expect(res.text()).resolves.not.toContain("ECONNREFUSED");
  });
});
