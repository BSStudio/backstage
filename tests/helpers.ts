import { NextResponse } from "next/server";
import { vi } from "vitest";
import type { SyncResult } from "@/lib/sync/executor";
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

const ok: SyncResult = { success: true, result: null };

export function mockWebsiteOrchestrators() {
  const orchestrateCreateWebsiteUser = vi.fn(
    async (): Promise<SyncResult> => ok,
  );
  const orchestrateUpdateWebsiteUser = vi.fn(
    async (): Promise<SyncResult> => ok,
  );
  const orchestrateDeactivateWebsiteUser = vi.fn(
    async (): Promise<SyncResult> => ok,
  );

  vi.doMock("@/lib/sync/website/orchestrators", () => ({
    orchestrateCreateWebsiteUser,
    orchestrateUpdateWebsiteUser,
    orchestrateDeactivateWebsiteUser,
  }));

  return {
    orchestrateCreateWebsiteUser,
    orchestrateUpdateWebsiteUser,
    orchestrateDeactivateWebsiteUser,
  };
}

export function mockGoogleGroupOrchestrators() {
  const orchestrateAddToAlumniGroup = vi.fn(
    async (): Promise<SyncResult> => ok,
  );
  const orchestrateAddToGoogleGroup = vi.fn(
    async (): Promise<SyncResult> => ok,
  );
  const orchestrateRemoveFromGoogleGroup = vi.fn(
    async (): Promise<SyncResult> => ok,
  );

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
