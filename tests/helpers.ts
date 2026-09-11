import { NextResponse } from "next/server";
import { type Mock, vi } from "vitest";
import type { SyncResult } from "@/lib/sync/executor";
import type { UserRole } from "@/types";

export function mockSession(
  overrides: { id?: string; role?: UserRole; authentikUsername?: string } = {},
) {
  const { id = "test-user-id", role = "MEMBER", authentikUsername } = overrides;

  const session = {
    user: { id, role, authentikUsername },
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

export function mockDrupalOrchestrators() {
  const orchestrateCreateDrupalUser = vi.fn(
    async (): Promise<SyncResult> => ok,
  );
  const orchestrateUpdateDrupalUser = vi.fn(
    async (): Promise<SyncResult> => ok,
  );
  const orchestrateDeactivateDrupalUser = vi.fn(
    async (): Promise<SyncResult> => ok,
  );

  vi.doMock("@/lib/sync/drupal/orchestrators", () => ({
    orchestrateCreateDrupalUser,
    orchestrateUpdateDrupalUser,
    orchestrateDeactivateDrupalUser,
  }));

  return {
    orchestrateCreateDrupalUser,
    orchestrateUpdateDrupalUser,
    orchestrateDeactivateDrupalUser,
  };
}

export function mockWebsiteOrchestrators() {
  const orchestrateSyncWebsiteMember = vi.fn(
    async (): Promise<SyncResult> => ok,
  );

  vi.doMock("@/lib/sync/website/orchestrators", () => ({
    orchestrateSyncWebsiteMember,
  }));

  return { orchestrateSyncWebsiteMember };
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

// Mocks what `@/lib/session` reads rather than the module itself, so the real session
// helpers — and the actor derivation the actions rely on — stay under test.
export function mockAuthApi(getSession: Mock) {
  vi.doMock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Headers()),
  }));
  vi.doMock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
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
