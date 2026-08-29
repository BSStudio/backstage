import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canAdminister, canManageMembers } from "@/lib/permissions";
import { mockAuthApi } from "../helpers";

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});

function mockDeps(session: unknown) {
  mockAuthApi(vi.fn().mockResolvedValue(session));
  vi.doMock("next/navigation", () => ({ redirect: mockRedirect }));
}

beforeEach(() => {
  vi.resetModules();
  mockRedirect.mockClear();
});

describe("getSession", () => {
  it("returns session when authenticated", async () => {
    const session = { user: { id: "u1", role: "MEMBER" } };
    mockDeps(session);
    const mod = await import("@/lib/session");

    const result = await mod.getSession();
    expect(result).toBe(session);
  });

  it("returns null when not authenticated", async () => {
    mockDeps(null);
    const mod = await import("@/lib/session");

    const result = await mod.getSession();
    expect(result).toBeNull();
  });
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

describe("requirePermission", () => {
  it("returns session when the predicate allows the role", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    mockDeps(session);
    const mod = await import("@/lib/session");

    const result = await mod.requirePermission(canManageMembers);
    expect(result).toBe(session);
  });

  it("returns 403 when the predicate rejects the role", async () => {
    const session = { user: { id: "u1", role: "MEMBER" } };
    mockDeps(session);
    const mod = await import("@/lib/session");

    const result = await mod.requirePermission(canManageMembers);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockDeps(null);
    const mod = await import("@/lib/session");

    const result = await mod.requirePermission(canManageMembers);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });
});

describe("sessionActor", () => {
  it("reduces the session to an actor", async () => {
    mockDeps({ user: { id: "u1", role: "LEADER" } });
    const mod = await import("@/lib/session");

    expect(await mod.sessionActor()).toEqual({ id: "u1", role: "LEADER" });
  });

  it("returns null when not authenticated", async () => {
    mockDeps(null);
    const mod = await import("@/lib/session");

    expect(await mod.sessionActor()).toBeNull();
  });
});

describe("permittedActor", () => {
  it("returns the actor when the predicate allows the role", async () => {
    mockDeps({ user: { id: "u1", role: "ADMIN" } });
    const mod = await import("@/lib/session");

    expect(await mod.permittedActor(canAdminister)).toEqual({
      id: "u1",
      role: "ADMIN",
    });
  });

  it("returns null when the predicate rejects the role", async () => {
    mockDeps({ user: { id: "u1", role: "LEADER" } });
    const mod = await import("@/lib/session");

    expect(await mod.permittedActor(canAdminister)).toBeNull();
  });

  it("returns null when not authenticated", async () => {
    mockDeps(null);
    const mod = await import("@/lib/session");

    expect(await mod.permittedActor(canAdminister)).toBeNull();
  });
});

describe("pageActor", () => {
  it("returns the actor when no predicate is given", async () => {
    mockDeps({ user: { id: "u1", role: "MEMBER" } });
    const mod = await import("@/lib/session");

    expect(await mod.pageActor()).toEqual({ id: "u1", role: "MEMBER" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns the actor when the predicate allows the role", async () => {
    mockDeps({ user: { id: "u1", role: "ADMIN" } });
    const mod = await import("@/lib/session");

    expect(await mod.pageActor(canAdminister)).toEqual({
      id: "u1",
      role: "ADMIN",
    });
  });

  it("sends an unauthenticated visitor to the login page the layout uses", async () => {
    mockDeps(null);
    const mod = await import("@/lib/session");

    await expect(mod.pageActor()).rejects.toThrow("redirect:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("sends a visitor the predicate rejects home", async () => {
    mockDeps({ user: { id: "u1", role: "LEADER" } });
    const mod = await import("@/lib/session");

    await expect(mod.pageActor(canAdminister)).rejects.toThrow("redirect:/");
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
