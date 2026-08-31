import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_VARIANT,
  parseAuditDiff,
} from "@/lib/audit";

describe("AUDIT_ACTION_LABELS", () => {
  it("has a Hungarian label for every audit action", () => {
    expect(Object.keys(AUDIT_ACTION_LABELS)).toHaveLength(16);
    expect(AUDIT_ACTION_LABELS.MEMBER_CREATED).toBe("Létrehozás");
    expect(AUDIT_ACTION_LABELS.STATUS_CHANGED).toBe("Státusz módosítás");
    expect(AUDIT_ACTION_LABELS.ROLE_ASSIGNED).toBe("Pozíció hozzárendelés");
    expect(AUDIT_ACTION_LABELS.ROLE_REMOVED).toBe("Pozíció elvétel");
    expect(AUDIT_ACTION_LABELS.AVATAR_UPLOADED).toBe("Profilkép feltöltés");
    expect(AUDIT_ACTION_LABELS.AVATAR_REMOVED).toBe("Profilkép törlés");
    expect(AUDIT_ACTION_LABELS.GOOGLE_GROUP_SYNCED).toBe(
      "Google Group beolvasás",
    );
    expect(AUDIT_ACTION_LABELS.CARDDAV_TOKEN_CREATED).toBe(
      "CardDAV eszköz hozzáadás",
    );
    expect(AUDIT_ACTION_LABELS.CARDDAV_TOKEN_REVOKED).toBe(
      "CardDAV eszköz törlés",
    );
    expect(AUDIT_ACTION_LABELS.APP_LINK_CREATED).toBe("Alkalmazás létrehozás");
    expect(AUDIT_ACTION_LABELS.APP_LINK_UPDATED).toBe("Alkalmazás módosítás");
    expect(AUDIT_ACTION_LABELS.APP_LINK_DELETED).toBe("Alkalmazás törlés");
  });
});

describe("AUDIT_ACTION_VARIANT", () => {
  it("has a Tailwind class string for every audit action", () => {
    expect(Object.keys(AUDIT_ACTION_VARIANT)).toHaveLength(16);
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
