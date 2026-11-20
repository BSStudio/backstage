import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import {
  type Actor,
  canAdminister,
  canManageMembers,
  canManageShortLinks,
  canModifyMember,
  canViewAdminArea,
  ensureCanAdminister,
  ensureCanManageMembers,
  ensureCanManageShortLinks,
  ensureCanModifyMember,
  toActor,
} from "@/lib/permissions";

const ADMIN: Actor = { id: "admin-id", role: "ADMIN" };
const LEADER: Actor = { id: "leader-id", role: "LEADER" };
const MEMBER: Actor = { id: "member-id", role: "MEMBER" };

describe("toActor", () => {
  it("reduces a session to the actor the services take", () => {
    expect(toActor({ user: { id: "user-id", role: "LEADER" } })).toEqual({
      id: "user-id",
      role: "LEADER",
    });
  });
});

describe("canManageMembers", () => {
  it("allows admins and leaders", () => {
    expect(canManageMembers("ADMIN")).toBe(true);
    expect(canManageMembers("LEADER")).toBe(true);
  });

  it("denies members and unauthenticated visitors", () => {
    expect(canManageMembers("MEMBER")).toBe(false);
    expect(canManageMembers(undefined)).toBe(false);
  });
});

describe("canViewAdminArea", () => {
  it("allows admins and leaders", () => {
    expect(canViewAdminArea("ADMIN")).toBe(true);
    expect(canViewAdminArea("LEADER")).toBe(true);
  });

  it("denies members and unauthenticated visitors", () => {
    expect(canViewAdminArea("MEMBER")).toBe(false);
    expect(canViewAdminArea(undefined)).toBe(false);
  });
});

describe("canAdminister", () => {
  it("allows admins only", () => {
    expect(canAdminister("ADMIN")).toBe(true);
    expect(canAdminister("LEADER")).toBe(false);
    expect(canAdminister("MEMBER")).toBe(false);
    expect(canAdminister(undefined)).toBe(false);
  });
});

describe("canManageShortLinks", () => {
  it("allows admins and leaders", () => {
    expect(canManageShortLinks("ADMIN")).toBe(true);
    expect(canManageShortLinks("LEADER")).toBe(true);
  });

  it("denies members and unauthenticated visitors", () => {
    expect(canManageShortLinks("MEMBER")).toBe(false);
    expect(canManageShortLinks(undefined)).toBe(false);
  });
});

describe("canModifyMember", () => {
  it("allows a member to modify their own record", () => {
    expect(canModifyMember(MEMBER, MEMBER.id)).toBe(true);
  });

  it("denies a member another member's record", () => {
    expect(canModifyMember(MEMBER, "someone-else")).toBe(false);
  });

  it("allows leaders and admins any record", () => {
    expect(canModifyMember(LEADER, "someone-else")).toBe(true);
    expect(canModifyMember(ADMIN, "someone-else")).toBe(true);
  });
});

describe("ensureCanManageMembers", () => {
  it("passes for leaders and admins", () => {
    expect(() => ensureCanManageMembers(LEADER)).not.toThrow();
    expect(() => ensureCanManageMembers(ADMIN)).not.toThrow();
  });

  it("throws for members", () => {
    expect(() => ensureCanManageMembers(MEMBER)).toThrow(ForbiddenError);
  });
});

describe("ensureCanAdminister", () => {
  it("passes for admins", () => {
    expect(() => ensureCanAdminister(ADMIN)).not.toThrow();
  });

  it("throws for leaders", () => {
    expect(() => ensureCanAdminister(LEADER)).toThrow(ForbiddenError);
  });
});

describe("ensureCanManageShortLinks", () => {
  it("passes for leaders and admins", () => {
    expect(() => ensureCanManageShortLinks(LEADER)).not.toThrow();
    expect(() => ensureCanManageShortLinks(ADMIN)).not.toThrow();
  });

  it("throws for members", () => {
    expect(() => ensureCanManageShortLinks(MEMBER)).toThrow(ForbiddenError);
  });
});

describe("ensureCanModifyMember", () => {
  it("passes for the member themselves", () => {
    expect(() => ensureCanModifyMember(MEMBER, MEMBER.id)).not.toThrow();
  });

  it("throws for another member's record", () => {
    expect(() => ensureCanModifyMember(MEMBER, "someone-else")).toThrow(
      ForbiddenError,
    );
  });
});
