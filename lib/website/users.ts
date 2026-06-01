import { randomBytes } from "node:crypto";
import {
  getFormToken,
  loginWebsite,
  parseHtml,
  WebsiteError,
  type WebsiteSession,
  websiteGet,
  websitePost,
} from "./client";

// Drupal role IDs on bsstudio.hu
const WEBSITE_EDITOR = 8;
const VIDEO_META_EDITOR = 5;
const VIDEO_CONTENT_EDITOR = 4;
const ACTIVE = 1;

// BSS state labels expected by the website
export const WEBSITE_STATE = {
  MEMBER_CANDIDATE_CANDIDATE: "stúdiós-jelölt jelölt",
  MEMBER_CANDIDATE: "stúdiós jelölt",
  MEMBER: "stúdiós",
  ACTIVE_ALUMNI: "aktív öregtag",
  ALUMNI: "öregtag",
} as const;

const SUCCESS_PHRASE = "A változtatások mentése megtörtént.";

function generateRandomPassword(): string {
  return randomBytes(24).toString("base64url");
}

export function buildJoinYearFromSemester(semester: string): string {
  // semester format: "2025/2026/1" (autumn) or "2025/2026/2" (spring)
  const [startYear, endYear, number] = semester.split("/");
  return number === "1" ? `${startYear} ősz` : `${endYear} tavasz`;
}

export type CreateWebsiteUserInput = {
  username: string;
  fullname: string; // last name first, Hungarian order
  nickname: string;
  email: string;
  mobile: string;
  joinYear: string; // e.g. "2025 ősz"
};

/** Creates a new user on the website. Returns the website user_id (numeric string). */
export async function createWebsiteUser(
  input: CreateWebsiteUserInput,
): Promise<{ userId: string; username: string }> {
  const session = await loginWebsite();

  const createPage = await websiteGet(session, "/admin/user/user/create");
  const formToken = getFormToken(createPage, "edit-user-register-form-token");

  const password = generateRandomPassword();
  const data: Record<string, string | number> = {
    name: input.username,
    mail: input.email,
    "pass[pass1]": password,
    "pass[pass2]": password,
    status: ACTIVE,
    [`roles[${WEBSITE_EDITOR}]`]: WEBSITE_EDITOR,
    [`roles[${VIDEO_META_EDITOR}]`]: VIDEO_META_EDITOR,
    [`roles[${VIDEO_CONTENT_EDITOR}]`]: VIDEO_CONTENT_EDITOR,
    profile_BSS_join_year: input.joinYear,
    profile_BSS_state: WEBSITE_STATE.MEMBER_CANDIDATE_CANDIDATE,
    profile_email: input.email,
    profile_mobilephone_number: input.mobile,
    profile_fullname: input.fullname,
    profile_personal_nickname: input.nickname,
    profile_user_description: `Sziasztok! ${input.fullname} vagyok. Azért jöttem a BSS-be, hogy mindent IS megtudjak a televíziózás nagyszerű világáról. :)`,
    form_token: formToken,
    form_id: "user_register",
    language: "hu",
  };

  const response = await websitePost(session, "/admin/user/user/create", data);
  const successMarker = `Az új felhasználó fiók <a href="/user/${input.username}"><em>${input.username}</em></a> néven létrejött.`;
  if (!response.includes(successMarker)) {
    throw new WebsiteError(0, `User creation failed for ${input.username}`);
  }

  const userId = await fetchUserIdByUsername(session, input.username);
  return { userId, username: input.username };
}

async function fetchUserIdByUsername(
  session: WebsiteSession,
  username: string,
): Promise<string> {
  const html = await websiteGet(
    session,
    `/user/${encodeURIComponent(username)}`,
  );
  const $ = parseHtml(html);
  const href = $('a:contains("Szerkesztés")').attr("href");
  if (!href) {
    throw new WebsiteError(0, `Edit link not found for user ${username}`);
  }
  const match = href.match(/\/user\/([0-9]+)\/edit/);
  if (!match) {
    throw new WebsiteError(0, `User ID not parseable from ${href}`);
  }
  return match[1];
}

/** Look up the numeric website user_id by username. */
export async function getWebsiteUserId(username: string): Promise<string> {
  const session = await loginWebsite();
  return fetchUserIdByUsername(session, username);
}

export interface WebsiteUserDetails {
  email0: string;
  fullname: string;
  nickname: string;
  email1: string;
  mobile: string;
  inSch: boolean;
  position: string;
  passive: boolean;
  hasRole: boolean;
  role: string;
  isLeader: boolean;
  joined: string;
  emailSame: boolean;
}

async function fetchWebsiteUser(
  session: WebsiteSession,
  userId: string,
): Promise<WebsiteUserDetails> {
  const mainPage = parseHtml(await websiteGet(session, `/user/${userId}/edit`));
  const email0 = mainPage("input#edit-mail").attr("value") ?? "";

  const personalPage = parseHtml(
    await websiteGet(session, `/user/${userId}/edit/Személyes adatok`),
  );
  const fullname =
    personalPage("input#edit-profile-fullname").attr("value") ?? "";
  const nickname =
    personalPage("input#edit-profile-personal-nickname").attr("value") ?? "";

  const contactPage = parseHtml(
    await websiteGet(session, `/user/${userId}/edit/Elérhetőségek`),
  );
  const email1 = contactPage("input#edit-profile-email").attr("value") ?? "";
  const mobile =
    contactPage("input#edit-profile-mobilephone-number").attr("value") ?? "";
  const inSch = Boolean(
    contactPage("input#edit-profile-is-in-sch-this-semester").attr("checked"),
  );

  const bssPage = parseHtml(
    await websiteGet(session, `/user/${userId}/edit/BSS adatok`),
  );
  const position = bssPage('option[selected="selected"]').attr("value") ?? "";
  const passive = Boolean(
    bssPage("input#edit-profile-passive").attr("checked"),
  );
  const hasRole = Boolean(
    bssPage("input#edit-profile-BSS-is-in-BSS-HQ").attr("checked"),
  );
  const role = bssPage("input#edit-profile-BSS-HQ-role").attr("value") ?? "";
  const isLeader = Boolean(
    bssPage("input#edit-profile-BSS-is-leader").attr("checked"),
  );
  const joined =
    bssPage("input#edit-profile-BSS-join-year").attr("value") ?? "";

  return {
    email0,
    fullname,
    nickname,
    email1,
    mobile,
    inSch,
    position,
    passive,
    hasRole,
    role,
    isLeader,
    joined,
    emailSame: email0 === email1,
  };
}

/**
 * Sets a user to passive and removes all privileged group access.
 */
export async function deactivateWebsiteUser(userId: string): Promise<void> {
  const session = await loginWebsite();

  // Step 1: remove privileged groups by submitting the main edit form without role checkboxes.
  const mainHtml = await websiteGet(session, `/user/${userId}/edit`);
  const $main = parseHtml(mainHtml);
  const username = $main("input#edit-name").attr("value") ?? "";
  const email = $main("input#edit-mail").attr("value") ?? "";
  const mainToken = getFormToken(mainHtml, "edit-user-profile-form-form-token");

  const step1 = await websitePost(session, `/user/${userId}/edit`, {
    name: username,
    mail: email,
    form_token: mainToken,
    form_id: "user_profile_form",
  });
  if (!step1.includes(SUCCESS_PHRASE)) {
    throw new WebsiteError(0, `Deactivation step 1 failed for user ${userId}`);
  }

  // Step 2: mark user as passive on the BSS adatok tab.
  const bssHtml = await websiteGet(session, `/user/${userId}/edit/BSS adatok`);
  const $bss = parseHtml(bssHtml);
  const joined = $bss("input#edit-profile-BSS-join-year").attr("value") ?? "";
  const bssToken = getFormToken(bssHtml, "edit-user-profile-form-form-token");

  const step2 = await websitePost(session, `/user/${userId}/edit/BSS adatok`, {
    profile_passive: 1,
    profile_BSS_join_year: joined,
    form_token: bssToken,
    form_id: "user_profile_form",
  });
  if (!step2.includes(SUCCESS_PHRASE)) {
    throw new WebsiteError(0, `Deactivation step 2 failed for user ${userId}`);
  }
}

export type UpdateWebsiteUserInput = {
  fullname?: string;
  nickname?: string;
  email?: string;
  mobile?: string;
  inSch?: boolean;
  position?: string; // value from WEBSITE_STATE
  role?: string; // free text, "" to clear
  joined?: string; // e.g. "2025 ősz"
};

export async function updateWebsiteUser(
  userId: string,
  input: UpdateWebsiteUserInput,
): Promise<void> {
  const session = await loginWebsite();
  const current = await fetchWebsiteUser(session, userId);

  const mainHtml = await websiteGet(session, `/user/${userId}/edit`);
  const formToken = getFormToken(mainHtml, "edit-user-profile-form-form-token");

  // Személyes adatok — fullname / nickname
  if (input.fullname !== undefined || input.nickname !== undefined) {
    const data = {
      profile_fullname: input.fullname ?? current.fullname,
      profile_personal_nickname: input.nickname ?? current.nickname,
      form_token: formToken,
      form_id: "user_profile_form",
    };
    const response = await websitePost(
      session,
      `/user/${userId}/edit/Személyes adatok`,
      data,
    );
    if (!response.includes(SUCCESS_PHRASE)) {
      throw new WebsiteError(0, `Update Személyes adatok failed for ${userId}`);
    }
  }

  // Elérhetőségek — email / mobile / in_sch
  const inSchChanged =
    input.inSch !== undefined && current.inSch !== input.inSch;
  if (input.email !== undefined || input.mobile !== undefined || inSchChanged) {
    const data = {
      profile_email: input.email ?? current.email1,
      profile_mobilephone_number: input.mobile ?? current.mobile,
      profile_is_in_sch_this_semester: Number(
        inSchChanged ? input.inSch : current.inSch,
      ),
      form_token: formToken,
      form_id: "user_profile_form",
    };
    const response = await websitePost(
      session,
      `/user/${userId}/edit/Elérhetőségek`,
      data,
    );
    if (!response.includes(SUCCESS_PHRASE)) {
      throw new WebsiteError(0, `Update Elérhetőségek failed for ${userId}`);
    }
  }

  // BSS adatok — position / role / joined
  const roleChanged = input.role !== undefined && input.role !== current.role;
  if (
    input.position !== undefined ||
    roleChanged ||
    input.joined !== undefined
  ) {
    const isLeader =
      input.role === "Stúdióvezető" ||
      (current.role === "Stúdióvezető" && !roleChanged);
    const effectiveRole = input.role !== undefined ? input.role : current.role;
    const hasRole = Boolean(effectiveRole && !isLeader);

    const data = {
      profile_BSS_state: input.position ?? current.position,
      profile_BSS_is_leader: Number(isLeader),
      profile_BSS_is_in_BSS_HQ: Number(hasRole),
      profile_BSS_HQ_role: isLeader ? "" : effectiveRole,
      profile_BSS_join_year: input.joined ?? current.joined,
      form_token: formToken,
      form_id: "user_profile_form",
    };
    const response = await websitePost(
      session,
      `/user/${userId}/edit/BSS adatok`,
      data,
    );
    if (!response.includes(SUCCESS_PHRASE)) {
      throw new WebsiteError(0, `Update BSS adatok failed for ${userId}`);
    }
  }
}
