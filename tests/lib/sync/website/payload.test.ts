import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWebsiteMember } from "@/lib/sync/website/payload";

const MEMBER = {
  id: "uuid-member-1",
  firstName: "János",
  lastName: "Kovács",
  nickname: "Jani",
  avatarUrl: null,
  status: "MEMBER" as const,
  joinedSemester: "2025/2026/1",
  leadershipRole: null,
};

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://backstage.example.hu");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildWebsiteMember", () => {
  it("sends the id as the sub and the name in Hungarian order", () => {
    expect(buildWebsiteMember(MEMBER)).toEqual({
      sub: "uuid-member-1",
      fullName: "Kovács János",
      nickname: "Jani",
      avatarUrl: null,
      membershipStatus: "MEMBER",
      isLeadership: false,
      joinedSemester: "2025/2026/1",
    });
  });

  it("absolutises the avatar path, which the website renders verbatim", () => {
    const built = buildWebsiteMember({
      ...MEMBER,
      avatarUrl: "/avatars/uuid-member-1-square.webp",
    });

    expect(built.avatarUrl).toBe(
      "https://backstage.example.hu/avatars/uuid-member-1-square.webp",
    );
  });

  it("throws rather than sending a path when APP_URL is unset", () => {
    vi.stubEnv("APP_URL", "");

    expect(() =>
      buildWebsiteMember({ ...MEMBER, avatarUrl: "/avatars/a-square.webp" }),
    ).toThrow("Missing APP_URL");
  });

  it("reports leadership from the role's presence", () => {
    const built = buildWebsiteMember({
      ...MEMBER,
      leadershipRole: { id: "role-1" },
    });

    expect(built.isLeadership).toBe(true);
  });

  it("keeps a missing nickname null rather than falling back to a name", () => {
    expect(
      buildWebsiteMember({ ...MEMBER, nickname: null }).nickname,
    ).toBeNull();
  });

  it("sends a local member's prefixed id unchanged", () => {
    const built = buildWebsiteMember({ ...MEMBER, id: "local-abc123" });

    expect(built.sub).toBe("local-abc123");
  });
});
