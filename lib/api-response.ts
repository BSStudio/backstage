import { NextResponse } from "next/server";

// 207 when the database write landed but a sync step failed — the UI shows a warning, not an
// error. The body a route answers with decides which of these it wants, and neither can be
// reached by forgetting an argument.

// For a body that already describes the outcome (`{ archived: true }`), so the failures join
// it as one more field.
export function syncJson<T extends object>(
  body: T,
  syncErrors: string[],
  options: { status?: number } = {},
): NextResponse {
  if (syncErrors.length > 0) {
    return NextResponse.json({ ...body, syncErrors }, { status: 207 });
  }
  return NextResponse.json(body, { status: options.status ?? 200 });
}

// For a body that is the resource itself, which has nowhere to carry the failures: the
// partial answer names the resource rather than spreading its fields next to `syncErrors`.
export function syncJsonResource<T extends object>(
  key: string,
  resource: T,
  syncErrors: string[],
  options: { status?: number } = {},
): NextResponse {
  if (syncErrors.length > 0) {
    return NextResponse.json({ [key]: resource, syncErrors }, { status: 207 });
  }
  return NextResponse.json(resource, { status: options.status ?? 200 });
}
