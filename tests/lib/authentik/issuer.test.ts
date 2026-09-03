import { afterEach, describe, expect, it, vi } from "vitest";
import { authentikIssuer } from "@/lib/authentik/issuer";

afterEach(() => {
  vi.unstubAllEnvs();
});

const ISSUER = "https://auth.example.com/application/o/backstage";

describe("authentikIssuer", () => {
  it("strips the trailing slash Authentik's own issuer identifier carries", () => {
    vi.stubEnv("AUTHENTIK_ISSUER", `${ISSUER}/`);
    expect(authentikIssuer()).toBe(ISSUER);
  });

  it("strips a run of trailing slashes", () => {
    vi.stubEnv("AUTHENTIK_ISSUER", `${ISSUER}///`);
    expect(authentikIssuer()).toBe(ISSUER);
  });

  it("leaves an issuer without a trailing slash alone", () => {
    vi.stubEnv("AUTHENTIK_ISSUER", ISSUER);
    expect(authentikIssuer()).toBe(ISSUER);
  });

  it("answers with an empty string when unset, so callers can reject it", () => {
    vi.stubEnv("AUTHENTIK_ISSUER", undefined);
    expect(authentikIssuer()).toBe("");
  });
});
