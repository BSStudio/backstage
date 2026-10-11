import { describe, expect, it } from "vitest";
import {
  PUBLISH_STATE_BADGE_CLASS,
  PUBLISH_STATE_LABELS,
  PUBLISH_STATES,
  publishState,
  shortLinkUrl,
} from "@/lib/short-links";

describe("shortLinkUrl", () => {
  it("joins the base and the slug", () => {
    expect(shortLinkUrl("https://l.example.hu", "promo")).toBe(
      "https://l.example.hu/promo",
    );
  });

  it("falls back to a bare path when no base is configured", () => {
    expect(shortLinkUrl(null, "promo")).toBe("/promo");
  });
});

describe("publishState", () => {
  const published = new Date("2026-01-02T00:00:00Z");

  it("reports a link that has never been pushed", () => {
    expect(publishState({ updatedAt: published, publishedAt: null })).toBe(
      "UNPUBLISHED",
    );
  });

  it("reports a link edited since it was pushed", () => {
    expect(
      publishState({
        updatedAt: new Date("2026-01-03T00:00:00Z"),
        publishedAt: published,
      }),
    ).toBe("STALE");
  });

  it("reports a link KV holds the current target for", () => {
    expect(
      publishState({
        updatedAt: published,
        publishedAt: new Date("2026-01-04T00:00:00Z"),
      }),
    ).toBe("PUBLISHED");
  });
});

describe("publish state presentation", () => {
  it("has a Hungarian label and a badge class for every state", () => {
    for (const state of PUBLISH_STATES) {
      expect(PUBLISH_STATE_LABELS[state]).toBeTruthy();
      expect(PUBLISH_STATE_BADGE_CLASS[state]).toContain("bg-");
      expect(PUBLISH_STATE_BADGE_CLASS[state]).toContain("text-");
    }
  });
});
