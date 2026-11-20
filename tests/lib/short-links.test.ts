import { describe, expect, it } from "vitest";
import {
  PUBLISH_STATE_BADGE_CLASS,
  PUBLISH_STATE_LABELS,
  PUBLISH_STATES,
  publishState,
  shortLinkPrefix,
  shortLinkUrl,
} from "@/lib/short-links";

describe("shortLinkUrl", () => {
  it("joins the base and the slug", () => {
    expect(shortLinkUrl("https://bsstudio.hu/s", "promo")).toBe(
      "https://bsstudio.hu/s/promo",
    );
  });
});

describe("shortLinkPrefix", () => {
  it("drops the scheme and ends in the slash the slug follows", () => {
    expect(shortLinkPrefix("https://bsstudio.hu/s")).toBe("bsstudio.hu/s/");
  });
});

describe("publishState", () => {
  const url = "https://bsstudio.hu/b";

  it("reports a link that has never been pushed", () => {
    expect(publishState({ url, publishedUrl: null })).toBe("UNPUBLISHED");
  });

  it("reports a link retargeted since it was pushed", () => {
    expect(publishState({ url, publishedUrl: "https://bsstudio.hu/a" })).toBe(
      "STALE",
    );
  });

  it("reports a link KV holds the current target for", () => {
    expect(publishState({ url, publishedUrl: url })).toBe("PUBLISHED");
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
