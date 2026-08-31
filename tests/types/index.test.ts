import { describe, expect, it, vi } from "vitest";
import {
  civilDate,
  currentSemester,
  deriveUsername,
  formatSemester,
  hasAuthentikAccount,
  isAlumniStatus,
  LOCAL_MEMBER_ID_PREFIX,
  localMemberId,
  MEMBERSHIP_STATUSES,
  parseSemester,
  resolveUserRole,
} from "@/types";

// ─── parseSemester ───────────────────────────────────────────────────────────

describe("isAlumniStatus", () => {
  it("covers both alumni statuses and nothing else", () => {
    for (const status of MEMBERSHIP_STATUSES) {
      expect(isAlumniStatus(status)).toBe(
        status === "ALUMNI" || status === "ACTIVE_ALUMNI",
      );
    }
  });
});

describe("parseSemester", () => {
  it("parses autumn semester", () => {
    expect(parseSemester("2025/2026/1")).toEqual({
      startYear: 2025,
      endYear: 2026,
      number: 1,
    });
  });

  it("parses spring semester", () => {
    expect(parseSemester("2025/2026/2")).toEqual({
      startYear: 2025,
      endYear: 2026,
      number: 2,
    });
  });
});

// ─── formatSemester ──────────────────────────────────────────────────────────

describe("formatSemester", () => {
  it("formats autumn as startYear + ősz", () => {
    expect(formatSemester("2025/2026/1")).toBe("2025 ősz");
  });

  it("formats spring as endYear + tavasz", () => {
    expect(formatSemester("2025/2026/2")).toBe("2026 tavasz");
  });
});

// ─── currentSemester ─────────────────────────────────────────────────────────

describe("currentSemester", () => {
  it("returns autumn semester for September", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 8, 15)); // Sept 15, 2025
    expect(currentSemester()).toBe("2025/2026/1");
    vi.useRealTimers();
  });

  it("returns autumn semester for December", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 11, 1)); // Dec 1, 2025
    expect(currentSemester()).toBe("2025/2026/1");
    vi.useRealTimers();
  });

  it("returns autumn semester for January (still previous academic year)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 10)); // Jan 10, 2026
    expect(currentSemester()).toBe("2025/2026/1");
    vi.useRealTimers();
  });

  it("returns spring semester for February", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 15)); // Feb 15, 2026
    expect(currentSemester()).toBe("2025/2026/2");
    vi.useRealTimers();
  });

  it("returns spring semester for August", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 31)); // Aug 31, 2026
    expect(currentSemester()).toBe("2025/2026/2");
    vi.useRealTimers();
  });
});

// ─── civilDate ───────────────────────────────────────────────────────────────

describe("civilDate", () => {
  it("resolves the date in the studio zone by default", () => {
    // 00:30 in Budapest on the 5th is still the 4th in UTC.
    expect(civilDate(new Date("2026-09-04T22:30:00Z"))).toBe("2026-09-05");
  });

  it("stays on the previous date before local midnight", () => {
    expect(civilDate(new Date("2026-09-04T21:30:00Z"))).toBe("2026-09-04");
  });

  it("pads month and day to two digits", () => {
    expect(civilDate(new Date("2026-01-02T12:00:00Z"))).toBe("2026-01-02");
  });

  it("honours an explicit zone, reusing the cached formatter", () => {
    expect(civilDate(new Date("2026-09-04T22:30:00Z"), "Asia/Tokyo")).toBe(
      "2026-09-05",
    );
    expect(civilDate(new Date("2026-09-04T12:00:00Z"), "Asia/Tokyo")).toBe(
      "2026-09-04",
    );
  });
});

// ─── deriveUsername ──────────────────────────────────────────────────────────

describe("deriveUsername", () => {
  it("uses first letter of simple first name", () => {
    expect(deriveUsername("János", "Kovács")).toBe("jkovacs");
  });

  it("handles cs digraph", () => {
    expect(deriveUsername("Csaba", "Nagy")).toBe("csnagy");
  });

  it("handles dzs trigraph", () => {
    expect(deriveUsername("Dzsennifer", "Kiss")).toBe("dzskiss");
  });

  it("handles sz digraph", () => {
    expect(deriveUsername("Szabolcs", "Tóth")).toBe("sztoth");
  });

  it("handles gy digraph", () => {
    expect(deriveUsername("György", "Fekete")).toBe("gyfekete");
  });

  it("removes hyphens from last name", () => {
    expect(deriveUsername("Dzsennifer", "Kiss-Kovács")).toBe("dzskisskovacs");
  });

  it("strips diacritics", () => {
    expect(deriveUsername("Áron", "Ötvös")).toBe("aotvos");
  });
});

// ─── resolveUserRole ─────────────────────────────────────────────────────────

describe("resolveUserRole", () => {
  it("returns ADMIN when user is in admin group", () => {
    vi.stubEnv("AUTHENTIK_GROUP_ADMIN", "admins");
    vi.stubEnv("AUTHENTIK_GROUP_LEADERSHIP", "leaders");
    expect(resolveUserRole(["admins", "leaders"])).toBe("ADMIN");
    vi.unstubAllEnvs();
  });

  it("returns LEADER when user is in leadership group", () => {
    vi.stubEnv("AUTHENTIK_GROUP_ADMIN", "admins");
    vi.stubEnv("AUTHENTIK_GROUP_LEADERSHIP", "leaders");
    expect(resolveUserRole(["leaders"])).toBe("LEADER");
    vi.unstubAllEnvs();
  });

  it("returns MEMBER when user is in no special group", () => {
    vi.stubEnv("AUTHENTIK_GROUP_ADMIN", "admins");
    vi.stubEnv("AUTHENTIK_GROUP_LEADERSHIP", "leaders");
    expect(resolveUserRole(["some-other-group"])).toBe("MEMBER");
    vi.unstubAllEnvs();
  });

  it("throws when the group names are not configured", () => {
    vi.stubEnv("AUTHENTIK_GROUP_ADMIN", "");
    vi.stubEnv("AUTHENTIK_GROUP_LEADERSHIP", "leaders");
    expect(() => resolveUserRole(["admins"])).toThrow(/AUTHENTIK_GROUP_ADMIN/);

    vi.stubEnv("AUTHENTIK_GROUP_ADMIN", "admins");
    vi.stubEnv("AUTHENTIK_GROUP_LEADERSHIP", "");
    expect(() => resolveUserRole(["admins"])).toThrow(
      /AUTHENTIK_GROUP_LEADERSHIP/,
    );
    vi.unstubAllEnvs();
  });

  it("prioritizes ADMIN over LEADER", () => {
    vi.stubEnv("AUTHENTIK_GROUP_ADMIN", "admins");
    vi.stubEnv("AUTHENTIK_GROUP_LEADERSHIP", "leaders");
    expect(resolveUserRole(["leaders", "admins"])).toBe("ADMIN");
    vi.unstubAllEnvs();
  });
});

// ─── Member identity ─────────────────────────────────────────────────────────

describe("member ids", () => {
  it("treats a bare Authentik UUID as having an account", () => {
    expect(hasAuthentikAccount("7c9e6679-7425-40de-944b-e07fc1f90ae7")).toBe(
      true,
    );
  });

  it("treats a prefixed id as having no account", () => {
    expect(
      hasAuthentikAccount(
        `${LOCAL_MEMBER_ID_PREFIX}7c9e6679-7425-40de-944b-e07fc1f90ae7`,
      ),
    ).toBe(false);
  });

  it("mints prefixed, unique ids", () => {
    const id = localMemberId();
    expect(id.startsWith(LOCAL_MEMBER_ID_PREFIX)).toBe(true);
    expect(hasAuthentikAccount(id)).toBe(false);
    expect(localMemberId()).not.toBe(id);
  });
});
