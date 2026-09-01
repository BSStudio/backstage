import {
  type CalendarEvent,
  isGoogleCalendarConfigured,
  listCalendarEvents,
} from "@/lib/google/calendar";
import { logger } from "@/lib/observability/logger";
import { addDays, civilDate, daysBetween, startOfWeek } from "@/types";

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
      /**
       * Under way right now, shortest first. The shortest is the most specific thing
       * happening — a party inside a festival week rather than the week itself — which is
       * what the dashboard leads with.
       */
      running: CalendarEvent[];
      /** Soonest event that has not started. */
      next: CalendarEvent | null;
      /** Always CALENDAR_WEEKS entries; an empty one renders as a single line. */
      weeks: CalendarWeek[];
    };

type CacheEntry = { window: string; expiresAt: number } & (
  | { ok: true; events: CalendarEvent[] }
  | { ok: false }
);

// One slot rather than a map keyed by window: the window moves once a studio day, so a map
// would only ever hold one reachable entry and accumulate a dead one per day of uptime.
let cache: CacheEntry | null = null;

/** Test seam: the module-level cache would otherwise leak between cases. */
export function clearCalendarCache(): void {
  cache = null;
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
  const window = `${timeMin.toISOString()}|${timeMax.toISOString()}`;
  if (cache?.window === window && cache.expiresAt > Date.now()) {
    return cache.ok ? cache.events : null;
  }

  try {
    const events = await listCalendarEvents({ timeMin, timeMax });
    cache = { window, ok: true, events, expiresAt: Date.now() + CACHE_TTL_MS };
    return events;
  } catch (error) {
    // Not a Sentry incident: the widget says so on the dashboard, which every member sees,
    // and a calendar that is merely slow would otherwise report an outage every refresh.
    logger.warn("calendar_read_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    cache = { window, ok: false, expiresAt: Date.now() + FAILURE_TTL_MS };
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

/** Already begun. An all-day event counts for every date it covers — it has no clock. */
function isRunning(event: CalendarEvent, today: string, now: Date): boolean {
  if (event.allDay) return event.date <= today;
  return event.startsAt.getTime() <= now.getTime();
}

// Milliseconds, so an all-day event and a timed one can be compared. A seven-hour party is
// shorter than a one-day event, which is what puts it ahead of the week it belongs to.
function duration(event: CalendarEvent): number {
  if (event.allDay) {
    return (daysBetween(event.date, event.endDate) + 1) * 86_400_000;
  }
  return (
    (event.endsAt?.getTime() ?? event.startsAt.getTime()) -
    event.startsAt.getTime()
  );
}

// Only events that have not started reach this, so none of them is dated before today and
// every one lands on or after the first Monday. What is under way belongs to the hero.
function groupIntoWeeks(
  events: CalendarEvent[],
  firstMonday: string,
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
    // Google's window is bounded in instants and ours in whole weeks, so the last day or
    // two it returns can fall past the final Monday.
    byMonday.get(startOfWeek(event.date))?.push(event);
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
  const running = ahead
    .filter((event) => isRunning(event, today, now))
    .sort((a, b) => duration(a) - duration(b));
  const next = ahead.find((event) => !isRunning(event, today, now)) ?? null;

  // The hero renders whatever it shows in full, so the list below picks up after it. When
  // nothing is running the hero is `next`, and that is the one the list leaves out instead.
  const hero = running.length > 0 ? running : next ? [next] : [];
  const rest = ahead.filter((event) => !hero.includes(event));

  return {
    status: "ok",
    running,
    next,
    weeks: groupIntoWeeks(rest, firstMonday),
  };
}
