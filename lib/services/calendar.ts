import {
  type CalendarEvent,
  isGoogleCalendarConfigured,
  listCalendarEvents,
} from "@/lib/google/calendar";
import { logger } from "@/lib/observability/logger";
import { addDays, civilDate, startOfWeek } from "@/types";

export type { CalendarEvent } from "@/lib/google/calendar";

/** Weeks the dashboard groups into, counted from the Monday of the current one. */
export const CALENDAR_WEEKS = 4;

const CACHE_TTL_MS = 5 * 60_000;
// A calendar that has stopped answering is retried sooner than a healthy one is refreshed:
// long enough that thirty dashboards do not each wait out the same timeout, short enough
// that a restored share shows up while somebody is still looking.
const FAILURE_TTL_MS = 60_000;

export interface CalendarWeek {
  /** Monday, "YYYY-MM-DD". */
  start: string;
  /** Sunday, inclusive. */
  end: string;
  events: CalendarEvent[];
}

export type DashboardCalendar =
  | { status: "unconfigured" }
  | { status: "unavailable" }
  | {
      status: "ok";
      /** The event to lead with — in progress or soonest. Null on an empty window. */
      next: CalendarEvent | null;
      /** Always CALENDAR_WEEKS entries; an empty one renders as a single line. */
      weeks: CalendarWeek[];
      /** Everything still ahead, `next` included. */
      total: number;
    };

type CacheEntry =
  | { ok: true; events: CalendarEvent[]; expiresAt: number }
  | { ok: false; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** Test seam: the module-level cache would otherwise leak between cases. */
export function clearCalendarCache(): void {
  cache.clear();
}

// The window is derived from civil dates rather than the instant, so its bounds — and with
// them the cache key — hold still for a whole day instead of moving every request.
function windowFor(today: string) {
  const firstMonday = startOfWeek(today);
  return {
    firstMonday,
    // A day of slack on each side: the bounds are UTC midnights standing in for studio
    // ones, and the per-request filter drops whatever that over-fetches.
    timeMin: new Date(`${addDays(today, -1)}T00:00:00Z`),
    timeMax: new Date(
      `${addDays(firstMonday, CALENDAR_WEEKS * 7 + 1)}T00:00:00Z`,
    ),
  };
}

async function readEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[] | null> {
  const key = `${timeMin.toISOString()}|${timeMax.toISOString()}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ok ? cached.events : null;
  }

  try {
    const events = await listCalendarEvents({ timeMin, timeMax });
    cache.set(key, { ok: true, events, expiresAt: Date.now() + CACHE_TTL_MS });
    return events;
  } catch (error) {
    // Not a Sentry incident: the widget says so on the dashboard, which every member sees,
    // and a calendar that is merely slow would otherwise report an outage every refresh.
    logger.warn("calendar_read_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    cache.set(key, { ok: false, expiresAt: Date.now() + FAILURE_TTL_MS });
    return null;
  }
}

/**
 * Events still ahead. An event under way counts as ahead — a multi-day one reports the day
 * it began, which is why it is grouped under today rather than under a week already gone.
 */
function isAhead(event: CalendarEvent, today: string, now: Date): boolean {
  if (event.endDate < today) return false;
  if (event.allDay) return true;
  return (event.endsAt ?? event.startsAt).getTime() >= now.getTime();
}

function groupIntoWeeks(
  events: CalendarEvent[],
  firstMonday: string,
  today: string,
): CalendarWeek[] {
  const weeks: CalendarWeek[] = [];
  const byMonday = new Map<string, CalendarEvent[]>();

  for (let index = 0; index < CALENDAR_WEEKS; index += 1) {
    const start = addDays(firstMonday, index * 7);
    const bucket: CalendarEvent[] = [];
    byMonday.set(start, bucket);
    weeks.push({ start, end: addDays(start, 6), events: bucket });
  }

  for (const event of events) {
    const bucket = byMonday.get(
      startOfWeek(event.date < today ? today : event.date),
    );
    // Google's window is bounded in instants and ours in whole weeks, so the last day or
    // two it returns can fall past the final Monday.
    bucket?.push(event);
  }

  return weeks;
}

/** The dashboard's calendar: what is next, and the weeks after it. */
export async function getDashboardCalendar(
  now: Date = new Date(),
): Promise<DashboardCalendar> {
  if (!isGoogleCalendarConfigured()) return { status: "unconfigured" };

  const today = civilDate(now);
  const { firstMonday, timeMin, timeMax } = windowFor(today);

  const events = await readEvents(timeMin, timeMax);
  if (!events) return { status: "unavailable" };

  const ahead = events.filter((event) => isAhead(event, today, now));
  const [next = null, ...rest] = ahead;

  return {
    status: "ok",
    next,
    weeks: groupIntoWeeks(rest, firstMonday, today),
    total: ahead.length,
  };
}
