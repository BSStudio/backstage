import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoginDrupal, mockDrupalGet, mockDrupalPost } = vi.hoisted(() => ({
  mockLoginDrupal: vi.fn(),
  mockDrupalGet: vi.fn(),
  mockDrupalPost: vi.fn(),
}));

// Only the transport is mocked — getFormToken/parseHtml/DrupalError stay real
// so the tests exercise the actual Drupal HTML scraping.
vi.mock("@/lib/drupal/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/drupal/client")>()),
  loginDrupal: mockLoginDrupal,
  drupalGet: mockDrupalGet,
  drupalPost: mockDrupalPost,
}));

import {
  buildJoinYearFromSemester,
  createDrupalUser,
  deactivateDrupalUser,
  getDrupalUserId,
  reactivateDrupalUser,
  updateDrupalUser,
} from "@/lib/drupal/users";

const USER_ID = "42";
const SUCCESS = "<p>A változtatások mentése megtörtént.</p>";
const PROFILE_TOKEN =
  '<input id="edit-user-profile-form-form-token" value="tok-profile">';

const PAGES: Record<string, string> = {
  "/admin/user/user/create":
    '<input id="edit-user-register-form-token" value="tok-create">',
  "/user/jkovacs": '<a href="/user/42/edit">Szerkesztés</a>',
  [`/user/${USER_ID}/edit`]: `
    <input id="edit-name" value="jkovacs">
    <input id="edit-mail" value="jkovacs@bsstudio.hu">
    ${PROFILE_TOKEN}`,
  [`/user/${USER_ID}/edit/Személyes adatok`]: `
    <input id="edit-profile-fullname" value="Kovács János">
    <input id="edit-profile-personal-nickname" value="Jani">`,
  [`/user/${USER_ID}/edit/Elérhetőségek`]: `
    <input id="edit-profile-email" value="jkovacs@bsstudio.hu">
    <input id="edit-profile-mobilephone-number" value="+36301234567">
    <input id="edit-profile-is-in-sch-this-semester" checked="checked">`,
  [`/user/${USER_ID}/edit/BSS adatok`]: `
    <select>
      <option value="stúdiós jelölt">jelölt</option>
      <option value="stúdiós" selected="selected">stúdiós</option>
    </select>
    <input id="edit-profile-passive">
    <input id="edit-profile-BSS-is-in-BSS-HQ" checked="checked">
    <input id="edit-profile-BSS-HQ-role" value="Főszerkesztő">
    <input id="edit-profile-BSS-is-leader">
    <input id="edit-profile-BSS-join-year" value="2025 ősz">
    ${PROFILE_TOKEN}`,
};

/** Payload of the POST to `path`, or undefined if that tab was never submitted. */
function postTo(path: string): Record<string, string | number> | undefined {
  return mockDrupalPost.mock.calls.find((c) => c[1] === path)?.[2];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoginDrupal.mockResolvedValue({ baseUrl: "https://web.example.com" });
  mockDrupalGet.mockImplementation((_session, path: string) => {
    const page = PAGES[path];
    if (page === undefined) throw new Error(`unexpected GET ${path}`);
    return Promise.resolve(page);
  });
  mockDrupalPost.mockResolvedValue(SUCCESS);
});

// ─── buildJoinYearFromSemester ───────────────────────────────────────────────

describe("buildJoinYearFromSemester", () => {
  it("maps semester 1 to the start year in autumn", () => {
    expect(buildJoinYearFromSemester("2025/2026/1")).toBe("2025 ősz");
  });

  it("maps semester 2 to the end year in spring", () => {
    expect(buildJoinYearFromSemester("2025/2026/2")).toBe("2026 tavasz");
  });
});

// ─── createDrupalUser ───────────────────────────────────────────────────────

const CREATE_INPUT = {
  username: "jkovacs",
  fullname: "Kovács János",
  nickname: "Jani",
  email: "jkovacs@bsstudio.hu",
  mobile: "+36301234567",
  joinYear: "2025 ősz",
};

function createdMarker(username: string) {
  return `Az új felhasználó fiók <a href="/user/${username}"><em>${username}</em></a> néven létrejött.`;
}

describe("createDrupalUser", () => {
  beforeEach(() => {
    mockDrupalPost.mockResolvedValue(createdMarker("jkovacs"));
  });

  it("submits the register form and returns the scraped uid", async () => {
    const result = await createDrupalUser(CREATE_INPUT);

    expect(result).toEqual({ userId: "42", username: "jkovacs" });

    const data = postTo("/admin/user/user/create");
    expect(data).toMatchObject({
      name: "jkovacs",
      mail: "jkovacs@bsstudio.hu",
      status: 1,
      "roles[8]": 8,
      "roles[5]": 5,
      "roles[4]": 4,
      profile_BSS_join_year: "2025 ősz",
      profile_BSS_state: "stúdiós-jelölt jelölt",
      profile_email: "jkovacs@bsstudio.hu",
      profile_mobilephone_number: "+36301234567",
      profile_fullname: "Kovács János",
      profile_personal_nickname: "Jani",
      form_token: "tok-create",
      form_id: "user_register",
      language: "hu",
    });
  });

  it("mints a matching random password pair that differs per call", async () => {
    await createDrupalUser(CREATE_INPUT);
    const first = postTo("/admin/user/user/create");
    expect(first?.["pass[pass1]"]).toBe(first?.["pass[pass2]"]);
    expect(String(first?.["pass[pass1]"]).length).toBeGreaterThan(0);

    mockDrupalPost.mockClear();
    await createDrupalUser(CREATE_INPUT);
    const second = postTo("/admin/user/user/create");

    expect(second?.["pass[pass1]"]).not.toBe(first?.["pass[pass1]"]);
  });

  it("throws when the success marker is absent", async () => {
    mockDrupalPost.mockResolvedValue("<p>Hiba történt.</p>");

    await expect(createDrupalUser(CREATE_INPUT)).rejects.toThrow(
      "User creation failed for jkovacs",
    );
  });

  it("throws when the profile page has no edit link", async () => {
    mockDrupalGet.mockImplementation((_s, path: string) =>
      Promise.resolve(path === "/user/jkovacs" ? "<p>nincs</p>" : PAGES[path]),
    );

    await expect(createDrupalUser(CREATE_INPUT)).rejects.toThrow(
      "Edit link not found for user jkovacs",
    );
  });

  it("throws when the edit link has no numeric uid", async () => {
    mockDrupalGet.mockImplementation((_s, path: string) =>
      Promise.resolve(
        path === "/user/jkovacs"
          ? '<a href="/profile/settings">Szerkesztés</a>'
          : PAGES[path],
      ),
    );

    await expect(createDrupalUser(CREATE_INPUT)).rejects.toThrow(
      "User ID not parseable from /profile/settings",
    );
  });
});

// ─── getDrupalUserId ────────────────────────────────────────────────────────

describe("getDrupalUserId", () => {
  it("logs in and scrapes the uid from the profile page", async () => {
    await expect(getDrupalUserId("jkovacs")).resolves.toBe("42");
    expect(mockLoginDrupal).toHaveBeenCalledTimes(1);
  });

  it("URL-encodes the username", async () => {
    mockDrupalGet.mockResolvedValue('<a href="/user/7/edit">Szerkesztés</a>');

    await getDrupalUserId("a b");

    expect(mockDrupalGet.mock.calls[0][1]).toBe("/user/a%20b");
  });
});

// ─── deactivateDrupalUser ───────────────────────────────────────────────────

describe("deactivateDrupalUser", () => {
  it("drops privileged roles then marks the user passive", async () => {
    await deactivateDrupalUser(USER_ID);

    // Step 1 re-submits the main form with no roles[] keys, which clears them.
    const step1 = postTo(`/user/${USER_ID}/edit`);
    expect(step1).toEqual({
      name: "jkovacs",
      mail: "jkovacs@bsstudio.hu",
      form_token: "tok-profile",
      form_id: "user_profile_form",
    });

    expect(postTo(`/user/${USER_ID}/edit/BSS adatok`)).toEqual({
      profile_passive: 1,
      profile_BSS_join_year: "2025 ősz",
      form_token: "tok-profile",
      form_id: "user_profile_form",
    });
  });

  it("throws when step 1 does not confirm", async () => {
    mockDrupalPost.mockResolvedValueOnce("<p>Hiba</p>");

    await expect(deactivateDrupalUser(USER_ID)).rejects.toThrow(
      "Deactivation step 1 failed for user 42",
    );
    expect(mockDrupalPost).toHaveBeenCalledTimes(1);
  });

  it("falls back to an empty join year when the field is absent", async () => {
    mockDrupalGet.mockImplementation((_s, path: string) =>
      Promise.resolve(
        path === `/user/${USER_ID}/edit/BSS adatok`
          ? PROFILE_TOKEN
          : PAGES[path],
      ),
    );

    await deactivateDrupalUser(USER_ID);

    expect(postTo(`/user/${USER_ID}/edit/BSS adatok`)).toMatchObject({
      profile_BSS_join_year: "",
    });
  });

  it("falls back to empty name and mail when the main form is bare", async () => {
    mockDrupalGet.mockImplementation((_s, path: string) =>
      Promise.resolve(
        path === `/user/${USER_ID}/edit` ? PROFILE_TOKEN : PAGES[path],
      ),
    );

    await deactivateDrupalUser(USER_ID);

    expect(postTo(`/user/${USER_ID}/edit`)).toMatchObject({
      name: "",
      mail: "",
    });
  });

  it("throws when step 2 does not confirm", async () => {
    mockDrupalPost
      .mockResolvedValueOnce(SUCCESS)
      .mockResolvedValueOnce("<p>Hiba</p>");

    await expect(deactivateDrupalUser(USER_ID)).rejects.toThrow(
      "Deactivation step 2 failed for user 42",
    );
  });
});

// ─── reactivateDrupalUser ───────────────────────────────────────────────────

describe("reactivateDrupalUser", () => {
  it("restores the roles and leaves the account status alone", async () => {
    await reactivateDrupalUser(USER_ID);

    expect(postTo(`/user/${USER_ID}/edit`)).toEqual({
      name: "jkovacs",
      mail: "jkovacs@bsstudio.hu",
      "roles[8]": 8,
      "roles[5]": 5,
      "roles[4]": 4,
      form_token: "tok-profile",
      form_id: "user_profile_form",
    });

    expect(postTo(`/user/${USER_ID}/edit/BSS adatok`)).toEqual({
      profile_passive: 0,
      profile_BSS_join_year: "2025 ősz",
      form_token: "tok-profile",
      form_id: "user_profile_form",
    });
  });

  it("throws when step 1 does not confirm", async () => {
    mockDrupalPost.mockResolvedValueOnce("<p>Hiba</p>");

    await expect(reactivateDrupalUser(USER_ID)).rejects.toThrow(
      "Reactivation step 1 failed for user 42",
    );
    expect(mockDrupalPost).toHaveBeenCalledTimes(1);
  });

  it("throws when step 2 does not confirm", async () => {
    mockDrupalPost
      .mockResolvedValueOnce(SUCCESS)
      .mockResolvedValueOnce("<p>Hiba</p>");

    await expect(reactivateDrupalUser(USER_ID)).rejects.toThrow(
      "Reactivation step 2 failed for user 42",
    );
  });

  it("falls back to empty name, mail and join year when the forms are bare", async () => {
    mockDrupalGet.mockResolvedValue(PROFILE_TOKEN);

    await reactivateDrupalUser(USER_ID);

    expect(postTo(`/user/${USER_ID}/edit`)).toMatchObject({
      name: "",
      mail: "",
    });
    expect(postTo(`/user/${USER_ID}/edit/BSS adatok`)).toMatchObject({
      profile_BSS_join_year: "",
    });
  });
});

// ─── updateDrupalUser ───────────────────────────────────────────────────────

const PERSONAL_TAB = `/user/${USER_ID}/edit/Személyes adatok`;
const CONTACT_TAB = `/user/${USER_ID}/edit/Elérhetőségek`;
const BSS_TAB = `/user/${USER_ID}/edit/BSS adatok`;

describe("updateDrupalUser", () => {
  it("posts nothing when the input is empty", async () => {
    await updateDrupalUser(USER_ID, {});
    expect(mockDrupalPost).not.toHaveBeenCalled();
  });

  it("treats every missing profile field as empty or false", async () => {
    // A Drupal account whose optional profile fields were never filled in.
    mockDrupalGet.mockImplementation((_s, path: string) =>
      Promise.resolve(path.endsWith("/edit") ? PROFILE_TOKEN : ""),
    );

    await updateDrupalUser(USER_ID, {
      fullname: "Kovács János",
      email: "jkovacs@bsstudio.hu",
      inSch: true,
      position: "stúdiós",
    });

    expect(postTo(PERSONAL_TAB)).toMatchObject({
      profile_personal_nickname: "",
    });
    expect(postTo(CONTACT_TAB)).toMatchObject({
      profile_mobilephone_number: "",
      profile_is_in_sch_this_semester: 1,
    });
    expect(postTo(BSS_TAB)).toMatchObject({
      profile_BSS_is_leader: 0,
      profile_BSS_is_in_BSS_HQ: 0,
      profile_BSS_HQ_role: "",
      profile_BSS_join_year: "",
    });
  });

  it("logs in once for the whole update", async () => {
    await updateDrupalUser(USER_ID, { fullname: "Kovács J." });
    expect(mockLoginDrupal).toHaveBeenCalledTimes(1);
  });

  it("preserves the untouched sibling field on the personal tab", async () => {
    await updateDrupalUser(USER_ID, { fullname: "Kovács J." });

    expect(postTo(PERSONAL_TAB)).toEqual({
      profile_fullname: "Kovács J.",
      profile_personal_nickname: "Jani",
      form_token: "tok-profile",
      form_id: "user_profile_form",
    });
    expect(postTo(CONTACT_TAB)).toBeUndefined();
    expect(postTo(BSS_TAB)).toBeUndefined();
  });

  it("updates the nickname alone", async () => {
    await updateDrupalUser(USER_ID, { nickname: "Janó" });

    expect(postTo(PERSONAL_TAB)).toMatchObject({
      profile_fullname: "Kovács János",
      profile_personal_nickname: "Janó",
    });
  });

  it("updates email and mobile, keeping the current in-sch flag", async () => {
    await updateDrupalUser(USER_ID, {
      email: "uj@bsstudio.hu",
      mobile: "+36209999999",
    });

    expect(postTo(CONTACT_TAB)).toMatchObject({
      profile_email: "uj@bsstudio.hu",
      profile_mobilephone_number: "+36209999999",
      profile_is_in_sch_this_semester: 1,
    });
  });

  it("submits the contact tab when only inSch flips", async () => {
    await updateDrupalUser(USER_ID, { inSch: false });

    expect(postTo(CONTACT_TAB)).toMatchObject({
      profile_email: "jkovacs@bsstudio.hu",
      profile_mobilephone_number: "+36301234567",
      profile_is_in_sch_this_semester: 0,
    });
  });

  it("skips the contact tab when inSch already matches", async () => {
    await updateDrupalUser(USER_ID, { inSch: true });
    expect(postTo(CONTACT_TAB)).toBeUndefined();
  });

  it("updates the position and keeps the existing role", async () => {
    await updateDrupalUser(USER_ID, { position: "öregtag" });

    expect(postTo(BSS_TAB)).toEqual({
      profile_BSS_state: "öregtag",
      profile_passive: 0,
      profile_BSS_is_leader: 0,
      profile_BSS_is_in_BSS_HQ: 1,
      profile_BSS_HQ_role: "Főszerkesztő",
      profile_BSS_join_year: "2025 ősz",
      form_token: "tok-profile",
      form_id: "user_profile_form",
    });
  });

  it("keeps an archived member passive", async () => {
    mockDrupalGet.mockImplementation((_session, path: string) =>
      Promise.resolve(
        path === BSS_TAB
          ? PAGES[BSS_TAB].replace(
              '<input id="edit-profile-passive">',
              '<input id="edit-profile-passive" checked="checked">',
            )
          : PAGES[path],
      ),
    );

    await updateDrupalUser(USER_ID, { position: "öregtag" });

    expect(postTo(BSS_TAB)).toMatchObject({ profile_passive: 1 });
  });

  it("sets the leader flag and clears the HQ role for Stúdióvezető", async () => {
    await updateDrupalUser(USER_ID, { role: "Stúdióvezető" });

    expect(postTo(BSS_TAB)).toMatchObject({
      profile_BSS_is_leader: 1,
      profile_BSS_is_in_BSS_HQ: 0,
      profile_BSS_HQ_role: "",
    });
  });

  it("sets a non-leader role as an HQ role", async () => {
    await updateDrupalUser(USER_ID, { role: "Gyártásvezető" });

    expect(postTo(BSS_TAB)).toMatchObject({
      profile_BSS_is_leader: 0,
      profile_BSS_is_in_BSS_HQ: 1,
      profile_BSS_HQ_role: "Gyártásvezető",
    });
  });

  it("clears both flags when the role is removed", async () => {
    await updateDrupalUser(USER_ID, { role: "" });

    expect(postTo(BSS_TAB)).toMatchObject({
      profile_BSS_is_leader: 0,
      profile_BSS_is_in_BSS_HQ: 0,
      profile_BSS_HQ_role: "",
    });
  });

  it("skips the BSS tab when the role is re-submitted unchanged", async () => {
    await updateDrupalUser(USER_ID, { role: "Főszerkesztő" });
    expect(postTo(BSS_TAB)).toBeUndefined();
  });

  it("keeps an existing Stúdióvezető marked as leader on an unrelated edit", async () => {
    mockDrupalGet.mockImplementation((_s, path: string) =>
      Promise.resolve(
        path === BSS_TAB
          ? PAGES[path].replace("Főszerkesztő", "Stúdióvezető")
          : PAGES[path],
      ),
    );

    await updateDrupalUser(USER_ID, { joined: "2024 tavasz" });

    expect(postTo(BSS_TAB)).toMatchObject({
      profile_BSS_is_leader: 1,
      profile_BSS_is_in_BSS_HQ: 0,
      profile_BSS_HQ_role: "",
      profile_BSS_join_year: "2024 tavasz",
    });
  });

  it.each([
    ["Személyes adatok", { fullname: "X" }],
    ["Elérhetőségek", { email: "x@bsstudio.hu" }],
    ["BSS adatok", { position: "öregtag" }],
  ])("throws when the %s tab does not confirm", async (tab, input) => {
    mockDrupalPost.mockResolvedValue("<p>Hiba</p>");

    await expect(updateDrupalUser(USER_ID, input)).rejects.toThrow(
      `Update ${tab} failed for 42`,
    );
  });
});
