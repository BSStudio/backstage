import { describe, expect, it } from "vitest";
import {
  APP_LINK_ACCENT_LABELS,
  APP_LINK_ICON_LABELS,
  APP_LINK_ICONS,
  APP_LINK_TILE_CLASS,
  appLinkHost,
  appLinkIcon,
} from "@/lib/app-links";
import { APP_LINK_ACCENTS, APP_LINK_ICON_NAMES } from "@/types";

describe("APP_LINK_ICONS", () => {
  it("has a component and a Hungarian label for every offered icon", () => {
    for (const name of APP_LINK_ICON_NAMES) {
      expect(APP_LINK_ICONS[name]).toBeDefined();
      expect(APP_LINK_ICON_LABELS[name]).toBeTruthy();
    }
  });
});

describe("appLinkIcon", () => {
  it("resolves a stored name to its component", () => {
    expect(appLinkIcon("cloud")).toBe(APP_LINK_ICONS.cloud);
  });

  it("falls back for a name no longer on the list", () => {
    expect(appLinkIcon("skull")).toBe(APP_LINK_ICONS.link);
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
