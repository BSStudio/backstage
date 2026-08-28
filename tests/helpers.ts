import { NextResponse } from "next/server";
import { vi } from "vitest";
import type { UserRole } from "@/types";

export function mockSession(overrides: { id?: string; role?: UserRole } = {}) {
  const id = overrides.id ?? "test-user-id";
  const role = overrides.role ?? "MEMBER";

  const session = {
    user: { id, role },
  };

  vi.doMock("@/lib/session", () => ({
    requireAuth: vi.fn().mockResolvedValue(session),
    requirePermission: vi.fn((allows: (r: UserRole) => boolean) => {
      if (!allows(role)) {
        return Promise.resolve(
          NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        );
      }
      return Promise.resolve(session);
    }),
  }));

  return session;
}

const ok = { success: true as const, result: null };

export function mockWebsiteOrchestrators() {
  vi.doMock("@/lib/sync/website/orchestrators", () => ({
    orchestrateCreateWebsiteUser: vi.fn(async () => ok),
    orchestrateUpdateWebsiteUser: vi.fn(async () => ok),
    orchestrateDeactivateWebsiteUser: vi.fn(async () => ok),
  }));
}

export function mockGoogleGroupOrchestrators() {
  const orchestrateAddToAlumniGroup = vi.fn(async () => ok);
  const orchestrateAddToGoogleGroup = vi.fn(async () => ok);
  const orchestrateRemoveFromGoogleGroup = vi.fn(async () => ok);

  vi.doMock("@/lib/sync/google/orchestrators", () => ({
    orchestrateAddToAlumniGroup,
    orchestrateAddToGoogleGroup,
    orchestrateRemoveFromGoogleGroup,
  }));

  return {
    orchestrateAddToAlumniGroup,
    orchestrateAddToGoogleGroup,
    orchestrateRemoveFromGoogleGroup,
  };
}

export function mockNoSession() {
  const response = NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 },
  );

  vi.doMock("@/lib/session", () => ({
    requireAuth: vi.fn().mockResolvedValue(response),
    requirePermission: vi.fn().mockResolvedValue(response),
  }));
}
