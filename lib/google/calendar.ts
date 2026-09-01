import { addDays, civilDate, STUDIO_TIME_ZONE } from "@/types";
import { googleFetch } from "./client";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPE_CALENDAR_READONLY =
  "https://www.googleapis.com/auth/calendar.readonly";

const MAX_PAGES = 5;
const PAGE_SIZE = 250;

interface CalendarEventBase {
  id: string;
  title: string;
  location: string | null;
  /** First calendar date at the studio, "YYYY-MM-DD". Grouping and day labels compare this. */
  date: string;
  /** Last date the event covers, inclusive. Equal to `date` for anything single-day. */
  endDate: string;
}

// A union rather than nullable instants on one shape: an all-day event has no time at all,
// and a timed one always has a start. Callers narrow on `allDay` to render either, which is
// a distinction the UI has to make anyway.
export type CalendarEvent =
  | (CalendarEventBase & { allDay: true; startsAt: null; endsAt: null })
  | (CalendarEventBase & {
      allDay: false;
      startsAt: Date;
      endsAt: Date | null;
    });

interface ApiEvent {
  id?: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface EventsPage {
  items?: ApiEvent[];
  nextPageToken?: string;
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_CALENDAR_ID,
  );
}

export function getCalendarId(): string {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("Missing GOOGLE_CALENDAR_ID environment variable");
  }
  return calendarId;
}

// An event with neither a dateTime nor a date is not something the API returns; a title is,
// and Google renders an untitled event as this same string.
function toEvent(raw: ApiEvent, timeZone: string): CalendarEvent | null {
  const id = raw.id;
  if (!id) return null;

  const title = raw.summary?.trim() || "(Névtelen esemény)";
  const location = raw.location?.trim() || null;

  if (raw.start?.date) {
    const date = raw.start.date;
    // An all-day end is the morning after the last day covered — a single day on the 4th
    // arrives as the 4th to the 5th. Stepping back is what makes it comparable to today.
    const exclusiveEnd = raw.end?.date;
    return {
      id,
      title,
      location,
      allDay: true,
      date,
      endDate:
        exclusiveEnd && exclusiveEnd > date ? addDays(exclusiveEnd, -1) : date,
      startsAt: null,
      endsAt: null,
    };
  }

  if (!raw.start?.dateTime) return null;

  const startsAt = new Date(raw.start.dateTime);
  const end = raw.end?.dateTime;
  const endsAt = end ? new Date(end) : null;
  const date = civilDate(startsAt, timeZone);
  // A party that ends at 04:00 belongs to both dates; the later one is what keeps it on
  // the dashboard until it is actually over.
  const endDate = endsAt ? civilDate(endsAt, timeZone) : date;
  return {
    id,
    title,
    location,
    allDay: false,
    date,
    endDate: endDate > date ? endDate : date,
    startsAt,
    endsAt,
  };
}

/**
 * Events between two instants, recurrences already expanded and ordered by start.
 *
 * `singleEvents` is what turns a weekly meeting into one row per occurrence; without it
 * the API answers with the recurrence rule and a dashboard would show the series' first
 * instance forever. `orderBy=startTime` is only accepted alongside it.
 */
export async function listCalendarEvents({
  timeMin,
  timeMax,
  calendarId = getCalendarId(),
  timeZone = STUDIO_TIME_ZONE,
}: {
  timeMin: Date;
  timeMax: Date;
  calendarId?: string;
  timeZone?: string;
}): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      maxResults: String(PAGE_SIZE),
      timeZone,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const result = await googleFetch<EventsPage>(
      `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { scope: GOOGLE_SCOPE_CALENDAR_READONLY },
    );

    for (const raw of result.items ?? []) {
      const event = toEvent(raw, timeZone);
      if (event) events.push(event);
    }

    pageToken = result.nextPageToken;
    page += 1;
  } while (pageToken && page < MAX_PAGES);

  return events;
}
