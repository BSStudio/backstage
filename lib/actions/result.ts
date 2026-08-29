import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export type ActionResult<T = unknown> =
  | { success: true; data: T; syncErrors?: string[] }
  | { success: false; error: string };

export const UNAUTHORIZED = {
  success: false,
  error: "Jogosulatlan hozzáférés",
} as const;

export const FORBIDDEN = {
  success: false,
  error: "Hozzáférés megtagadva",
} as const;

// Typed service errors carry a Hungarian equivalent; anything else is a real fault and
// belongs on the error boundary, not in a result object.
export function mapActionError(
  error: unknown,
  messages: { validation?: string } = {},
): ActionResult<never> {
  if (error instanceof NotFoundError)
    return { success: false, error: "Nem található" };
  if (error instanceof ForbiddenError) return FORBIDDEN;
  /* v8 ignore else -- @preserve */
  if (error instanceof ValidationError)
    return {
      success: false,
      error: messages.validation ?? "Érvénytelen adatok",
    };
  /* v8 ignore next -- @preserve */
  throw error;
}
