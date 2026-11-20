import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const SLUG_MESSAGE = "Csak kisbetű, szám és kötőjel, kötőjellel nem kezdődhet";

const slugField = z
  .string({ error: "A végződés megadása kötelező" })
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

function bareHost(url: URL): string {
  return url.host.replace(/^www\./, "");
}

function normalisedPath(url: URL): string {
  return decodeURIComponent(url.pathname).replace(/\/+/g, "/").toLowerCase();
}

// Loose on purpose: a www alias, or an encoded, doubled or capitalised prefix, can still
// reach the Worker once the edge or the website normalises it.
function isUnderBase(value: string, shortBase: string): boolean {
  try {
    const base = new URL(shortBase);
    const target = new URL(value);
    const prefix = normalisedPath(base).replace(/\/*$/, "/");
    return (
      bareHost(target) === bareHost(base) &&
      normalisedPath(target).startsWith(prefix)
    );
  } catch {
    return false;
  }
}

// The protocol is pinned because the target is handed straight to a redirect:
// `javascript:alert(1)` parses as a valid URL and only this keeps it out.
function urlField(shortBase: string | null) {
  const field = z
    .string({ error: urlError })
    .trim()
    .pipe(z.url({ protocol: /^https?$/, error: urlError }));

  if (!shortBase) return field;

  return field.refine((value) => !isUnderBase(value, shortBase), {
    error: "A cél nem lehet egy másik rövid link",
  });
}

export function createShortLinkSchema(shortBase: string | null) {
  return z.object({
    slug: slugField,
    url: urlField(shortBase),
    note: noteField,
  });
}

export function updateShortLinkSchema(shortBase: string | null) {
  return z.object({
    url: urlField(shortBase).optional(),
    note: noteField,
  });
}

export function shortLinkFormSchema(shortBase: string | null) {
  return createShortLinkSchema(shortBase).required();
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
