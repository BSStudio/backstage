import { describe, expect, it } from "vitest";
import {
  buildDirectoryAttributes,
  buildDirectoryUser,
  generateInitialPassword,
} from "@/lib/sync/active-directory/attributes";

const MEMBER = {
  id: "3f0c9a1e-0000-4000-8000-000000000001",
  firstName: "János",
  lastName: "Szent-Györgyi",
  archived: false,
};

describe("buildDirectoryAttributes", () => {
  it("enables an active member's account with a non-expiring password", () => {
    expect(buildDirectoryAttributes(MEMBER)).toEqual({
      givenName: "János",
      sn: "Szent-Györgyi",
      displayName: "János Szent-Györgyi",
      userAccountControl: "66048",
    });
  });

  it("disables an archived member's account", () => {
    expect(
      buildDirectoryAttributes({ ...MEMBER, archived: true })
        .userAccountControl,
    ).toBe("66050");
  });
});

describe("buildDirectoryUser", () => {
  it("builds the full entry for an add", () => {
    const byType = Object.fromEntries(
      buildDirectoryUser(MEMBER, "jszentgyorgyi", "studio.test", "Pw1!").map(
        (a) => [a.type, a.values],
      ),
    );
    expect(byType).toMatchObject({
      objectClass: ["top", "person", "organizationalPerson", "user"],
      cn: [MEMBER.id],
      sAMAccountName: ["jszentgyorgyi"],
      userPrincipalName: ["jszentgyorgyi@studio.test"],
      givenName: ["János"],
      sn: ["Szent-Györgyi"],
      displayName: ["János Szent-Györgyi"],
      userAccountControl: ["66048"],
    });
    expect(byType.unicodePwd).toEqual([Buffer.from('"Pw1!"', "utf16le")]);
  });
});

describe("generateInitialPassword", () => {
  it("generates a fresh password clearing AD complexity", () => {
    const password = generateInitialPassword();
    expect(password.length).toBeGreaterThanOrEqual(32);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(generateInitialPassword()).not.toBe(password);
  });
});
