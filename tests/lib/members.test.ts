import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_VARIANT,
  getInitials,
  parseAuditDiff,
  STATUS_BADGE_CLASS,
  STATUS_ORDER,
} from "@/lib/members";

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

describe("AUDIT_ACTION_LABELS", () => {
  it("has a Hungarian label for every audit action", () => {
    expect(Object.keys(AUDIT_ACTION_LABELS)).toHaveLength(7);
    expect(AUDIT_ACTION_LABELS.MEMBER_CREATED).toBe("Létrehozás");
    expect(AUDIT_ACTION_LABELS.STATUS_CHANGED).toBe("Státusz módosítás");
    expect(AUDIT_ACTION_LABELS.ROLE_ASSIGNED).toBe("Pozíció kiosztás");
    expect(AUDIT_ACTION_LABELS.ROLE_REMOVED).toBe("Pozíció elvétel");
  });
});

describe("AUDIT_ACTION_VARIANT", () => {
  it("has a Tailwind class string for every audit action", () => {
    expect(Object.keys(AUDIT_ACTION_VARIANT)).toHaveLength(7);
    for (const val of Object.values(AUDIT_ACTION_VARIANT)) {
      expect(val).toContain("bg-");
      expect(val).toContain("text-");
    }
  });
});

describe("parseAuditDiff", () => {
  it("returns null for null/undefined", () => {
    expect(parseAuditDiff(null)).toBeNull();
    expect(parseAuditDiff(undefined)).toBeNull();
  });

  it("returns 'created' for creation diffs", () => {
    expect(parseAuditDiff({ created: { firstName: "A" } })).toBe("created");
  });

  it("parses field changes into structured entries", () => {
    const diff = {
      nickname: { old: null, new: "Béci" },
      university: { old: "BME", new: "ELTE" },
    };
    expect(parseAuditDiff(diff)).toEqual([
      { field: "nickname", old: null, new: "Béci" },
      { field: "university", old: "BME", new: "ELTE" },
    ]);
  });

  it("handles single field change", () => {
    const diff = { status: { old: "MEMBER_CANDIDATE", new: "MEMBER" } };
    expect(parseAuditDiff(diff)).toEqual([
      { field: "status", old: "MEMBER_CANDIDATE", new: "MEMBER" },
    ]);
  });
});
