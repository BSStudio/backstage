import { z } from "zod";
import { APP_LINK_ACCENTS, APP_LINK_ICON_NAMES } from "@/types";

function required(message: string) {
  return z.string({ error: message }).trim().min(1, { error: message });
}

const urlError: z.core.$ZodErrorMap = (issue) =>
  issue.input === "" ? "A webcím megadása kötelező" : "Érvénytelen webcím";

// The protocol is pinned because the card renders the URL as an href: `javascript:alert(1)`
// parses as a perfectly valid URL, and only this keeps it out of the anchor.
const urlField = z
  .string({ error: urlError })
  .trim()
  .pipe(z.url({ protocol: /^https?$/, error: urlError }));

const descriptionField = z
  .string()
  .trim()
  .max(80, "Legfeljebb 80 karakter")
  .optional();

export const CreateAppLinkSchema = z.object({
  name: required("A név megadása kötelező"),
  description: descriptionField,
  url: urlField,
  icon: z.enum(APP_LINK_ICON_NAMES, { error: "Válassz ikont" }),
  accent: z.enum(APP_LINK_ACCENTS, { error: "Válassz színt" }).default("BLUE"),
  featured: z.boolean().default(false),
});

export const UpdateAppLinkSchema = z.object({
  name: required("A név megadása kötelező").optional(),
  description: descriptionField,
  url: urlField.optional(),
  icon: z.enum(APP_LINK_ICON_NAMES, { error: "Válassz ikont" }).optional(),
  accent: z.enum(APP_LINK_ACCENTS, { error: "Válassz színt" }).optional(),
  featured: z.boolean().optional(),
});

export const MoveDirectionSchema = z.enum(["UP", "DOWN"], {
  error: "Érvénytelen irány",
});

export const AppLinkFormSchema = CreateAppLinkSchema.required();

export type CreateAppLinkInput = z.infer<typeof CreateAppLinkSchema>;
export type UpdateAppLinkInput = z.infer<typeof UpdateAppLinkSchema>;
export type AppLinkFormValues = z.infer<typeof AppLinkFormSchema>;
export type MoveDirection = z.infer<typeof MoveDirectionSchema>;
