import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockDeps(session: unknown) {
  vi.doMock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Headers()),
  }));
  vi.doMock("@/lib/auth", () => ({
    auth: {
      api: { getSession: vi.fn().mockResolvedValue(session) },
    },
  }));
}

beforeEach(() => {
  vi.resetModules();
});

describe("requireAuth", () => {
  it("returns session when authenticated", async () => {
    const session = { user: { id: "u1", role: "MEMBER" } };
    mockDeps(session);
    const mod = await import("@/lib/session");

    const result = await mod.requireAuth();
    expect(result).toBe(session);
  });

  it("returns 401 NextResponse when not authenticated", async () => {
    mockDeps(null);
    const mod = await import("@/lib/session");

    const result = await mod.requireAuth();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });
});

describe("requireRole", () => {
  it("returns session when user has required role", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    mockDeps(session);
    const mod = await import("@/lib/session");

    const result = await mod.requireRole("ADMIN", "LEADER");
    expect(result).toBe(session);
  });

  it("returns 403 when user lacks required role", async () => {
    const session = { user: { id: "u1", role: "MEMBER" } };
    mockDeps(session);
    const mod = await import("@/lib/session");

    const result = await mod.requireRole("ADMIN", "LEADER");
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockDeps(null);
    const mod = await import("@/lib/session");

    const result = await mod.requireRole("ADMIN");
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });
});
