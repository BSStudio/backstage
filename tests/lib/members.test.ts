import { describe, expect, it } from "vitest";
import { getInitials, STATUS_BADGE_CLASS, STATUS_ORDER } from "@/lib/members";

describe("getInitials", () => {
  it("returns last initial + first initial uppercased", () => {
    expect(getInitials("János", "Kovács")).toBe("KJ");
  });

  it("handles single-character names", () => {
    expect(getInitials("A", "B")).toBe("BA");
  });

  it("preserves diacritics in initials", () => {
    expect(getInitials("Áron", "Öreg")).toBe("ÖÁ");
  });
});

describe("STATUS_ORDER", () => {
  it("orders statuses from candidate-candidate to alumni", () => {
    expect(STATUS_ORDER.MEMBER_CANDIDATE_CANDIDATE).toBe(0);
    expect(STATUS_ORDER.MEMBER_CANDIDATE).toBe(1);
    expect(STATUS_ORDER.MEMBER).toBe(2);
    expect(STATUS_ORDER.ACTIVE_ALUMNI).toBe(3);
    expect(STATUS_ORDER.ALUMNI).toBe(4);
  });

  it("sorts statuses in the expected progression", () => {
    const shuffled = [
      "ALUMNI",
      "MEMBER",
      "MEMBER_CANDIDATE_CANDIDATE",
    ] as const;
    const sorted = [...shuffled].sort(
      (a, b) => STATUS_ORDER[a] - STATUS_ORDER[b],
    );
    expect(sorted).toEqual(["MEMBER_CANDIDATE_CANDIDATE", "MEMBER", "ALUMNI"]);
  });
});

describe("STATUS_BADGE_CLASS", () => {
  it("has an entry for every membership status", () => {
    expect(STATUS_BADGE_CLASS.MEMBER_CANDIDATE_CANDIDATE).toBeDefined();
    expect(STATUS_BADGE_CLASS.MEMBER_CANDIDATE).toBeDefined();
    expect(STATUS_BADGE_CLASS.MEMBER).toBeDefined();
    expect(STATUS_BADGE_CLASS.ACTIVE_ALUMNI).toBeDefined();
    expect(STATUS_BADGE_CLASS.ALUMNI).toBeDefined();
  });
});
