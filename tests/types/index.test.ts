import { describe, expect, it, vi } from "vitest";
import {
  currentSemester,
  deriveUsername,
  formatSemester,
  parseSemester,
  resolveUserRole,
} from "@/types";

// ─── parseSemester ───────────────────────────────────────────────────────────

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

  it("returns MEMBER when env vars are not set", () => {
    expect(resolveUserRole(["admins"])).toBe("MEMBER");
    vi.unstubAllEnvs();
  });

  it("prioritizes ADMIN over LEADER", () => {
    vi.stubEnv("AUTHENTIK_GROUP_ADMIN", "admins");
    vi.stubEnv("AUTHENTIK_GROUP_LEADERSHIP", "leaders");
    expect(resolveUserRole(["leaders", "admins"])).toBe("ADMIN");
    vi.unstubAllEnvs();
  });
});
