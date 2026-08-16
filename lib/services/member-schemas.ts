import { z } from "zod";
import { MEMBERSHIP_STATUSES } from "@/types";

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

export const CreateMemberSchema = z.object({
  firstName: required("A keresztnév megadása kötelező"),
  lastName: required("A vezetéknév megadása kötelező"),
  nickname: z.string().trim().optional(),
  email: emailField,
  mobile: z.string().trim().optional(),
  university: z.string().trim().optional(),
  major: z.string().trim().optional(),
  dormRoom: z.string().trim().optional(),
});

export const UpdateMemberSchema = z.object({
  firstName: required("A keresztnév megadása kötelező").optional(),
  lastName: required("A vezetéknév megadása kötelező").optional(),
  nickname: z.string().trim().optional(),
  email: emailField.optional(),
  mobile: z.string().trim().optional(),
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

export const NewMemberFormSchema = CreateMemberSchema.required();
export const EditMemberFormSchema = UpdateMemberSchema.required();
export const RoleFormSchema = AssignRoleSchema.extend({
  authentikGroupIds: z.array(z.string()),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
