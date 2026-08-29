import { NextResponse } from "next/server";

// 207 when the database write landed but a sync step failed — the UI shows a warning, not an
// error. `partial` is for the routes whose success body is the resource itself, which has
// nowhere to carry syncErrors alongside it.
export function syncJson<T extends object>(
  body: T,
  syncErrors: string[],
  options: { status?: number; partial?: object } = {},
): NextResponse {
  if (syncErrors.length > 0) {
    return NextResponse.json(
      { ...(options.partial ?? body), syncErrors },
      { status: 207 },
    );
  }
  return NextResponse.json(body, { status: options.status ?? 200 });
}
