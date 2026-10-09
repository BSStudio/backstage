import { describe, expect, it } from "vitest";
import { type FeatureContext, featureHighlights } from "@/lib/features";

const MEMBER: FeatureContext = {
  memberId: "uuid-member-1",
  role: "MEMBER",
  rdpConfigured: true,
  calendarConfigured: true,
};

function keysFor(overrides: Partial<FeatureContext> = {}) {
  return featureHighlights({ ...MEMBER, ...overrides }).map((f) => f.key);
}

describe("featureHighlights", () => {
  it("lists what a member can reach", () => {
    expect(keysFor()).toEqual([
      "carddav",
      "computers",
      "rdp",
      "calendar",
      "apps",
    ]);
  });

  it("points the contact sync at the member's own profile", () => {
    const carddav = featureHighlights(MEMBER).find((f) => f.key === "carddav");

    expect(carddav?.href).toBe("/members/uuid-member-1");
  });

  // Listed and refused is the thing to avoid: /computers drops the download entirely.
  it("leaves the remote login out where it is not configured", () => {
    expect(keysFor({ rdpConfigured: false })).not.toContain("rdp");
    expect(keysFor({ rdpConfigured: false })).toContain("computers");
  });

  it("leaves the calendar out where there is none", () => {
    expect(keysFor({ calendarConfigured: false })).not.toContain("calendar");
  });

  it.each([["LEADER"], ["ADMIN"]] as const)(
    "offers the admin area to a %s",
    (role) => {
      expect(keysFor({ role })).toContain("admin");
    },
  );

  it("keeps the admin area from a member", () => {
    expect(keysFor()).not.toContain("admin");
  });

  it("gives every entry somewhere to go and something to read", () => {
    for (const highlight of featureHighlights({ ...MEMBER, role: "ADMIN" })) {
      expect(highlight.title).not.toBe("");
      expect(highlight.description).not.toBe("");
      expect(highlight.linkLabel).not.toBe("");
      expect(highlight.href.startsWith("/")).toBe(true);
    }
  });
});
