import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeDirectoryConfig,
  isActiveDirectoryConfigured,
  memberDistinguishedName,
} from "@/lib/active-directory/config";
import { stubActiveDirectoryEnv } from "../../helpers";

const PEM =
  "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUQ2FmZQ==\n-----END CERTIFICATE-----\n";
const PEM_BASE64 = Buffer.from(PEM).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isActiveDirectoryConfigured", () => {
  it("is configured once all five settings are present", () => {
    stubActiveDirectoryEnv();
    expect(isActiveDirectoryConfigured()).toBe(true);
  });

  it.each([
    "AD_LDAP_URL",
    "AD_BIND_DN",
    "AD_BIND_PASSWORD",
    "AD_USERS_OU",
    "AD_UPN_SUFFIX",
  ])("is not configured without %s", (name) => {
    stubActiveDirectoryEnv({ [name]: "" });
    expect(isActiveDirectoryConfigured()).toBe(false);
    expect(() => activeDirectoryConfig()).toThrow(/Missing AD_/);
  });
});

describe("activeDirectoryConfig", () => {
  it("reads the five settings and trusts the system store by default", () => {
    stubActiveDirectoryEnv();
    expect(activeDirectoryConfig()).toEqual({
      url: "ldaps://dc.studio.test:636",
      bindDn: "CN=svc-backstage,OU=Service,DC=studio,DC=test",
      bindPassword: "bind-secret",
      usersOu: "OU=Members,DC=studio,DC=test",
      upnSuffix: "studio.test",
      tlsOptions: {},
    });
  });

  it("pins the CA certificate when one is given", () => {
    stubActiveDirectoryEnv({ AD_LDAP_CA_CERT: PEM_BASE64 });
    expect(activeDirectoryConfig().tlsOptions).toEqual({ ca: PEM });
  });

  it.each(["false", "FALSE", " false "])(
    "skips verification for %j, over a CA cert",
    (value) => {
      stubActiveDirectoryEnv({
        AD_LDAP_TLS_VERIFY: value,
        AD_LDAP_CA_CERT: PEM_BASE64,
      });
      expect(activeDirectoryConfig().tlsOptions).toEqual({
        rejectUnauthorized: false,
      });
    },
  );

  it.each(["true", "0", ""])("keeps verification on for %j", (value) => {
    stubActiveDirectoryEnv({ AD_LDAP_TLS_VERIFY: value });
    expect(activeDirectoryConfig().tlsOptions).toEqual({});
  });

  it("refuses a CA certificate pasted as raw PEM", () => {
    stubActiveDirectoryEnv({ AD_LDAP_CA_CERT: PEM });
    expect(() => activeDirectoryConfig()).toThrow(
      "AD_LDAP_CA_CERT is not a base64-encoded PEM certificate",
    );
  });

  it("refuses a plain ldap:// URL", () => {
    stubActiveDirectoryEnv({ AD_LDAP_URL: "ldap://dc.studio.test:389" });
    expect(() => activeDirectoryConfig()).toThrow(
      "AD_LDAP_URL must start with ldaps://",
    );
  });
});

describe("memberDistinguishedName", () => {
  it("derives a member's DN from their id", () => {
    stubActiveDirectoryEnv();
    expect(
      memberDistinguishedName("3f0c9a1e-0000-4000-8000-000000000001"),
    ).toBe(
      "CN=3f0c9a1e-0000-4000-8000-000000000001,OU=Members,DC=studio,DC=test",
    );
  });

  it("derives the DN even when the TLS settings do not parse", () => {
    stubActiveDirectoryEnv({ AD_LDAP_CA_CERT: PEM });
    expect(memberDistinguishedName("x")).toBe(
      "CN=x,OU=Members,DC=studio,DC=test",
    );
  });

  it("refuses to name a DN without AD_USERS_OU", () => {
    stubActiveDirectoryEnv({ AD_USERS_OU: "" });
    expect(() => memberDistinguishedName("x")).toThrow(
      "Missing AD_USERS_OU environment variable",
    );
  });
});
