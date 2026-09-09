import { describe, expect, it } from "vitest";
import { editMemberFormSchema } from "@/lib/services/member-schemas";
import { localMemberId } from "@/types";

const AUTHENTIK_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const values = (mobile: string) => ({
  firstName: "Anna",
  lastName: "Kis",
  nickname: "",
  email: "anna@test.com",
  mobile,
  university: "",
  major: "",
  dormRoom: "",
  status: "MEMBER" as const,
});

describe("editMemberFormSchema", () => {
  it("requires a mobile from a member with an Authentik account", () => {
    const parsed = editMemberFormSchema(AUTHENTIK_ID).safeParse(values(""));

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({
      path: ["mobile"],
      message: "A telefonszám megadása kötelező",
    });
  });

  it("lets a member with no Authentik account go without one", () => {
    const parsed = editMemberFormSchema(localMemberId()).safeParse(values(""));

    expect(parsed.success).toBe(true);
    expect(parsed.data?.mobile).toBe("");
  });

  it("still checks the format of a number it did not require", () => {
    const local = localMemberId();

    expect(
      editMemberFormSchema(local).safeParse(values("06301234567")).success,
    ).toBe(false);
    expect(
      editMemberFormSchema(local).safeParse(values("+421903123456")).data
        ?.mobile,
    ).toBe("+421903123456");
  });

  it("normalises the separators out of an accepted number", () => {
    const parsed = editMemberFormSchema(AUTHENTIK_ID).safeParse(
      values("+36 (30) 123-4567"),
    );

    expect(parsed.data?.mobile).toBe("+36301234567");
  });
});
