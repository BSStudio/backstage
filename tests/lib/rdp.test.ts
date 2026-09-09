import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRdpFile, isRdpConfigured, rdpConfig } from "@/lib/rdp";

beforeEach(() => {
  vi.stubEnv("COMPUTER_RDP_HOST_SUFFIX", "example.hu");
  vi.stubEnv("COMPUTER_RDP_PORT", "13389");
  vi.stubEnv("COMPUTER_RDP_AD_DOMAIN", "BSS");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isRdpConfigured", () => {
  it("is false without a host suffix, so the page can drop the download", () => {
    vi.stubEnv("COMPUTER_RDP_HOST_SUFFIX", undefined);
    expect(isRdpConfigured()).toBe(false);
  });

  it("is true once the host suffix is set", () => {
    expect(isRdpConfigured()).toBe(true);
  });
});

describe("rdpConfig", () => {
  it("reads the configured suffix, port and domain", () => {
    expect(rdpConfig()).toEqual({
      hostSuffix: "example.hu",
      port: 13389,
      adDomain: "BSS",
    });
  });

  it("trims whitespace an edited env file leaves behind", () => {
    vi.stubEnv("COMPUTER_RDP_HOST_SUFFIX", "  example.hu  ");
    vi.stubEnv("COMPUTER_RDP_AD_DOMAIN", "  BSS  ");

    expect(rdpConfig()).toMatchObject({
      hostSuffix: "example.hu",
      adDomain: "BSS",
    });
  });

  it("throws when the host suffix is missing", () => {
    vi.stubEnv("COMPUTER_RDP_HOST_SUFFIX", undefined);
    expect(() => rdpConfig()).toThrow("COMPUTER_RDP_HOST_SUFFIX");
  });

  it("defaults to 3389 when no port is configured", () => {
    vi.stubEnv("COMPUTER_RDP_PORT", undefined);
    expect(rdpConfig().port).toBe(3389);
  });

  it.each([
    ["not a number", "nem-port"],
    ["fractional", "3389.5"],
    ["below the range", "0"],
    ["above the range", "70000"],
  ])("throws on a %s port", (_label, value) => {
    vi.stubEnv("COMPUTER_RDP_PORT", value);
    expect(() => rdpConfig()).toThrow("COMPUTER_RDP_PORT");
  });

  it("reports no domain when none is configured", () => {
    vi.stubEnv("COMPUTER_RDP_AD_DOMAIN", "");
    expect(rdpConfig().adDomain).toBeNull();
  });
});

describe("buildRdpFile", () => {
  it("addresses the machine at its own name under the configured suffix and port", () => {
    expect(buildRdpFile("nle4", "jkovacs")).toContain(
      "full address:s:nle4.example.hu:13389",
    );
  });

  it("prefills the domain account and still asks for the password", () => {
    expect(buildRdpFile("nle4", "jkovacs")).toBe(
      [
        "full address:s:nle4.example.hu:13389",
        "username:s:BSS\\jkovacs",
        "prompt for credentials:i:1",
        "",
      ].join("\r\n"),
    );
  });

  it("omits the username when the caller has none", () => {
    expect(buildRdpFile("nle4", null)).not.toContain("username:s:");
  });

  it("omits the username when no AD domain is configured", () => {
    vi.stubEnv("COMPUTER_RDP_AD_DOMAIN", undefined);
    expect(buildRdpFile("nle4", "jkovacs")).not.toContain("username:s:");
  });

  it("refuses a username that would inject settings lines of its own", () => {
    const file = buildRdpFile("nle4", "jkovacs\r\nalternate shell:s:calc.exe");

    expect(file).not.toContain("username:s:");
    expect(file).not.toContain("alternate shell");
  });
});
