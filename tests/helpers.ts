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
    requireRole: vi.fn((...roles: UserRole[]) => {
      if (!roles.includes(role)) {
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
  const orchestrateAddToGoogleGroup = vi.fn(async () => ok);
  const orchestrateRemoveFromGoogleGroup = vi.fn(async () => ok);

  vi.doMock("@/lib/sync/google/orchestrators", () => ({
    orchestrateAddToGoogleGroup,
    orchestrateRemoveFromGoogleGroup,
  }));

  return { orchestrateAddToGoogleGroup, orchestrateRemoveFromGoogleGroup };
}

export function mockNoSession() {
  const response = NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 },
  );

  vi.doMock("@/lib/session", () => ({
    requireAuth: vi.fn().mockResolvedValue(response),
    requireRole: vi.fn().mockResolvedValue(response),
  }));
}
