import { describe, expect, it } from "vitest";
import {
  COMPUTER_ONLINE_WINDOW_MS,
  COMPUTER_STATUS_CLASS,
  COMPUTER_STATUS_LABELS,
  COMPUTER_STATUSES,
  computerGauges,
  computerStatus,
  formatComputerName,
  formatLastSeen,
  formatLoggedInUser,
} from "@/lib/computers";

const NOW = new Date("2026-09-03T12:00:00Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("formatComputerName", () => {
  it("is the slug as the studio writes it", () => {
    expect(formatComputerName("nle4")).toBe("NLE4");
    expect(formatComputerName("stream-pc")).toBe("STREAM-PC");
  });
});

describe("computerStatus", () => {
  it("is online inside the window", () => {
    expect(computerStatus(ago(0), NOW)).toBe("ONLINE");
    expect(computerStatus(ago(COMPUTER_ONLINE_WINDOW_MS - 1), NOW)).toBe(
      "ONLINE",
    );
  });

  it("is offline at and past the window", () => {
    expect(computerStatus(ago(COMPUTER_ONLINE_WINDOW_MS), NOW)).toBe("OFFLINE");
    expect(computerStatus(ago(86_400_000), NOW)).toBe("OFFLINE");
  });

  it("defaults to the current time", () => {
    expect(computerStatus(new Date())).toBe("ONLINE");
  });
});

describe("status labels and classes", () => {
  it("cover every status", () => {
    for (const status of COMPUTER_STATUSES) {
      expect(COMPUTER_STATUS_LABELS[status]).toBeTruthy();
      expect(COMPUTER_STATUS_CLASS[status]).toContain("text-");
    }
  });
});

describe("formatLastSeen", () => {
  it.each([
    ["a few seconds", 30_000, "Néhány másodperce"],
    ["one minute", 60_000, "1 perce"],
    ["minutes", 15 * 60_000, "15 perce"],
    ["one hour", 3_600_000, "1 órája"],
    ["hours", 5 * 3_600_000, "5 órája"],
    ["one day", 86_400_000, "1 napja"],
    ["days", 5 * 86_400_000, "5 napja"],
  ])("renders %s", (_label, elapsed, expected) => {
    expect(formatLastSeen(ago(elapsed), NOW)).toBe(expected);
  });

  it("clamps a workstation clock that runs ahead", () => {
    expect(formatLastSeen(new Date(NOW.getTime() + 60_000), NOW)).toBe(
      "Néhány másodperce",
    );
  });

  it("defaults to the current time", () => {
    expect(formatLastSeen(new Date())).toBe("Néhány másodperce");
  });
});

describe("computerGauges", () => {
  it("labels every reported figure so none reads as free capacity", () => {
    expect(
      computerGauges({
        cpuPercent: 12.4,
        memoryPercent: 41.6,
        diskPercent: 78,
      }),
    ).toEqual([
      { label: "CPU-terhelés", percent: 12 },
      { label: "Foglalt memória", percent: 42 },
      { label: "Foglalt tárhely", percent: 78 },
    ]);
  });

  it("skips what the agent did not report", () => {
    expect(computerGauges({ memoryPercent: 41 })).toEqual([
      { label: "Foglalt memória", percent: 41 },
    ]);
  });

  it("keeps a genuine zero rather than dropping the row", () => {
    expect(computerGauges({ cpuPercent: 0 })).toEqual([
      { label: "CPU-terhelés", percent: 0 },
    ]);
  });

  it("is empty when there is no load at all", () => {
    expect(computerGauges({})).toEqual([]);
    expect(computerGauges({ os: "Windows 11 Pro" })).toEqual([]);
  });
});

describe("formatLoggedInUser", () => {
  it("names the signed-in account", () => {
    expect(formatLoggedInUser({ loggedInUser: "BSS\\nkovacs" })).toBe(
      "BSS\\nkovacs",
    );
  });

  it("says so when nobody is signed in", () => {
    expect(formatLoggedInUser({ loggedInUser: null })).toBe(
      "Nincs bejelentkezve",
    );
  });

  it("returns null when the agent did not report the field", () => {
    expect(formatLoggedInUser({})).toBeNull();
  });
});
