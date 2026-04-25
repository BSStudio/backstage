import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStatusGroupUuid } from "@/lib/sync/authentik/group-mapping";

beforeEach(() => {
  vi.stubEnv("AUTHENTIK_GROUP_CANDIDATE_CANDIDATE", "uuid-cc");
  vi.stubEnv("AUTHENTIK_GROUP_CANDIDATE", "uuid-c");
  vi.stubEnv("AUTHENTIK_GROUP_MEMBER", "uuid-m");
  vi.stubEnv("AUTHENTIK_GROUP_ALUMNI", "uuid-a");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getStatusGroupUuid", () => {
  it("maps each status to its group UUID", () => {
    expect(getStatusGroupUuid("MEMBER_CANDIDATE_CANDIDATE")).toBe("uuid-cc");
    expect(getStatusGroupUuid("MEMBER_CANDIDATE")).toBe("uuid-c");
    expect(getStatusGroupUuid("MEMBER")).toBe("uuid-m");
  });

  it("maps both alumni statuses to the same group", () => {
    expect(getStatusGroupUuid("ACTIVE_ALUMNI")).toBe("uuid-a");
    expect(getStatusGroupUuid("ALUMNI")).toBe("uuid-a");
  });

  it("throws when env var is missing", () => {
    vi.stubEnv("AUTHENTIK_GROUP_MEMBER", "");
    expect(() => getStatusGroupUuid("MEMBER")).toThrow(
      "Missing Authentik group UUID for status MEMBER",
    );
  });
});
