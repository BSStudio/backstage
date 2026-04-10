import { describe, expect, it } from "vitest";
import { NAV_LABELS } from "@/lib/nav-labels";

describe("NAV_LABELS", () => {
  it("has a non-empty Hungarian label for every key", () => {
    for (const [key, value] of Object.entries(NAV_LABELS)) {
      expect(value, `key "${key}" should have a non-empty label`).toBeTruthy();
      expect(value.trim()).toBe(value);
    }
  });

  it("includes labels for all top-level URL segments", () => {
    expect(NAV_LABELS.members).toBe("Tagok");
    expect(NAV_LABELS.admin).toBe("Admin");
    expect(NAV_LABELS.audit).toBe("Audit napló");
    expect(NAV_LABELS[""]).toBe("Kezdőlap");
  });

  it("includes sidebar-specific contextual labels", () => {
    expect(NAV_LABELS.membersActive).toBe("Aktív");
    expect(NAV_LABELS.adminApps).toBe("Alkalmazások kezelése");
  });
});
