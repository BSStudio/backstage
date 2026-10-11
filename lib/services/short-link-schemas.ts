import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const SLUG_MESSAGE = "Csak kisbetű, szám és kötőjel, kötőjellel nem kezdődhet";

const slugField = z
  .string({ error: "A rövidítés megadása kötelező" })
  .trim()
  .toLowerCase()
  .min(2, "Legalább 2 karakter")
  .max(64, "Legfeljebb 64 karakter")
  .regex(SLUG_PATTERN, SLUG_MESSAGE);

const urlError: z.core.$ZodErrorMap = (issue) =>
  issue.input === "" ? "A cél megadása kötelező" : "Érvénytelen webcím";

const noteField = z
  .string()
  .trim()
  .max(120, "Legfeljebb 120 karakter")
  .optional();

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

// The protocol is pinned because the target is handed straight to a redirect:
// `javascript:alert(1)` parses as a valid URL and only this keeps it out.
function urlField(shortHost: string | null) {
  const base = z
    .string({ error: urlError })
    .trim()
    .pipe(z.url({ protocol: /^https?$/, error: urlError }));

  if (!shortHost) return base;

  return base.refine((value) => hostOf(value) !== shortHost.toLowerCase(), {
    error: "A cél nem lehet egy másik rövid link",
  });
}

export function createShortLinkSchema(shortHost: string | null) {
  return z.object({
    slug: slugField,
    url: urlField(shortHost),
    note: noteField,
  });
}

export function updateShortLinkSchema(shortHost: string | null) {
  return z.object({
    url: urlField(shortHost).optional(),
    note: noteField,
  });
}

export function shortLinkFormSchema(shortHost: string | null) {
  return createShortLinkSchema(shortHost).required();
}

export type CreateShortLinkInput = z.infer<
  ReturnType<typeof createShortLinkSchema>
>;
export type UpdateShortLinkInput = z.infer<
  ReturnType<typeof updateShortLinkSchema>
>;
export type ShortLinkFormValues = z.infer<
  ReturnType<typeof shortLinkFormSchema>
>;
