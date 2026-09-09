import { z } from "zod";
import { hasAuthentikAccount, MEMBERSHIP_STATUSES } from "@/types";

function required(message: string) {
  return z.string({ error: message }).trim().min(1, { error: message });
}

const emailError: z.core.$ZodErrorMap = (issue) =>
  issue.input === ""
    ? "Az email-cím megadása kötelező"
    : "Érvénytelen email-cím";

const emailField = z
  .string({ error: emailError })
  .trim()
  .pipe(z.email({ error: emailError }));

// One spelling for every number, rather than the same person written four ways
// across the systems this syncs to — a consistency the studio's other
// applications rely on. The leading zero is excluded because no country code
// starts with one, which is what separates a real "+36…" from a Hungarian "06…"
// that lost its trunk prefix.
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

const mobileError: z.core.$ZodErrorMap = (issue) =>
  issue.input
    ? "A telefonszámot nemzetközi formátumban, országhívószámmal kell megadni (például +36301234567)"
    : "A telefonszám megadása kötelező";

// A pasted number is the same number whatever it was spaced with.
const normalizedMobile = z
  .string({ error: mobileError })
  .trim()
  .transform((value) => value.replace(/[\s().\-/]/g, ""));

const mobileField = normalizedMobile.refine(
  (value) => E164_PATTERN.test(value),
  { error: mobileError },
);

// Only a member with no Authentik account may end up without one.
const clearableMobileField = normalizedMobile.refine(
  (value) => value === "" || E164_PATTERN.test(value),
  { error: mobileError },
);

export const CreateMemberSchema = z.object({
  firstName: required("A keresztnév megadása kötelező"),
  lastName: required("A vezetéknév megadása kötelező"),
  nickname: z.string().trim().optional(),
  email: emailField,
  mobile: mobileField,
  university: z.string().trim().optional(),
  major: z.string().trim().optional(),
  dormRoom: z.string().trim().optional(),
});

export const UpdateMemberSchema = z.object({
  firstName: required("A keresztnév megadása kötelező").optional(),
  lastName: required("A vezetéknév megadása kötelező").optional(),
  nickname: z.string().trim().optional(),
  email: emailField.optional(),
  mobile: clearableMobileField.optional(),
  university: z.string().trim().optional(),
  major: z.string().trim().optional(),
  dormRoom: z.string().trim().optional(),
  status: z
    .enum(MEMBERSHIP_STATUSES, { error: "Érvénytelen státusz" })
    .optional(),
});

export const AssignRoleSchema = z.object({
  label: required("A pozíció nevének megadása kötelező"),
  authentikGroupIds: z.array(z.string()).default([]),
});

const UpdateMemberWithAccountSchema = UpdateMemberSchema.extend({
  mobile: mobileField.optional(),
});

// A member with no Authentik account is the only one who may go without a phone
// number. Both the service and the edit form pick their schema through here, so
// the two cannot disagree about who that is.
export function updateMemberSchema(memberId: string) {
  return hasAuthentikAccount(memberId)
    ? UpdateMemberWithAccountSchema
    : UpdateMemberSchema;
}

export const NewMemberFormSchema = CreateMemberSchema.required();

const EditMemberFormSchema = UpdateMemberSchema.required();
const EditMemberWithAccountFormSchema =
  UpdateMemberWithAccountSchema.required();

export function editMemberFormSchema(memberId: string) {
  return hasAuthentikAccount(memberId)
    ? EditMemberWithAccountFormSchema
    : EditMemberFormSchema;
}

export const RoleFormSchema = AssignRoleSchema.extend({
  authentikGroupIds: z.array(z.string()),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
