import { describe, expect, it } from "vitest";
import {
  getInitials,
  onboardingSteps,
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

describe("onboardingSteps", () => {
  const EMPTY = { avatarUrl: null, university: null, major: null };

  it("asks for everything a new member has not filled in", () => {
    const steps = onboardingSteps(EMPTY);

    expect(steps.map((step) => [step.key, step.done])).toEqual([
      ["account", true],
      ["avatar", false],
      ["studies", false],
    ]);
    expect(steps.map((step) => step.label)).toEqual([
      "Fiók létrehozva",
      "Profilkép feltöltése",
      "Egyetem és szak megadása",
    ]);
  });

  it("ticks the picture once there is one", () => {
    const steps = onboardingSteps({ ...EMPTY, avatarUrl: "/avatars/a.webp" });

    expect(steps.find((step) => step.key === "avatar")?.done).toBe(true);
  });

  // Half-filled studies are not done: the roster wants both halves.
  it.each([
    [{ university: "BME-VIK", major: null }, false],
    [{ university: null, major: "mérnökinformatikus" }, false],
    [{ university: "BME-VIK", major: "mérnökinformatikus" }, true],
  ])("reads %j as studies done: %s", (studies, done) => {
    const steps = onboardingSteps({ ...EMPTY, ...studies });

    expect(steps.find((step) => step.key === "studies")?.done).toBe(done);
  });

  // What the card watches for: every step done is what takes it off the dashboard.
  it("is complete once the picture and the studies are in", () => {
    const steps = onboardingSteps({
      avatarUrl: "/avatars/a.webp",
      university: "BME-VIK",
      major: "mérnökinformatikus",
    });

    expect(steps.every((step) => step.done)).toBe(true);
  });
});
