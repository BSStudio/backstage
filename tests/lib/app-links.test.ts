import { describe, expect, it } from "vitest";
import {
  APP_LINK_ACCENT_LABELS,
  APP_LINK_ICON_LABELS,
  APP_LINK_ICON_OPTIONS,
  APP_LINK_ICONS,
  APP_LINK_TILE_CLASS,
  appLinkHost,
} from "@/lib/app-links";
import { APP_LINK_ACCENTS, APP_LINK_ICON_NAMES } from "@/types";

describe("APP_LINK_ICONS", () => {
  it("has a component and a Hungarian label for every offered icon", () => {
    for (const name of APP_LINK_ICON_NAMES) {
      expect(APP_LINK_ICONS[name]).toBeDefined();
      expect(APP_LINK_ICON_LABELS[name]).toBeTruthy();
    }
  });

  it("offers every icon in the picker, in list order", () => {
    expect(APP_LINK_ICON_OPTIONS).toHaveLength(APP_LINK_ICON_NAMES.length);
    expect(APP_LINK_ICON_OPTIONS[0]).toEqual({
      value: "globe",
      label: "Földgömb",
    });
  });
});

describe("APP_LINK_TILE_CLASS", () => {
  it("has a background and a text class for every accent", () => {
    for (const accent of APP_LINK_ACCENTS) {
      expect(APP_LINK_TILE_CLASS[accent]).toContain("bg-app-");
      expect(APP_LINK_TILE_CLASS[accent]).toContain("text-app-");
      expect(APP_LINK_ACCENT_LABELS[accent]).toBeTruthy();
    }
  });
});

describe("appLinkHost", () => {
  it("returns the host without the scheme", () => {
    expect(appLinkHost("https://wiki.bsstudio.hu/doc/x")).toBe(
      "wiki.bsstudio.hu",
    );
  });

  it("drops a www prefix", () => {
    expect(appLinkHost("https://www.bsstudio.hu")).toBe("bsstudio.hu");
  });

  it("keeps a port, which distinguishes two apps on one host", () => {
    expect(appLinkHost("http://localhost:3000/apps")).toBe("localhost:3000");
  });

  it("falls back to the raw value when the URL will not parse", () => {
    expect(appLinkHost("nem-egy-url")).toBe("nem-egy-url");
  });
});
