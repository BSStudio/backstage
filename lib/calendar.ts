import type { CalendarEvent } from "@/lib/google/calendar";
import type { CalendarWeek } from "@/lib/services/calendar";
import { addDays, daysBetween, STUDIO_TIME_ZONE, startOfWeek } from "@/types";

// Two sets of formatters, and the difference matters. An instant is rendered in the studio's
// zone, because that is where the clock on the wall is. A "YYYY-MM-DD" is already a civil
// date with no zone of its own, so it is parsed as UTC and rendered as UTC — pushing it
// through Budapest would shift it a day.
const clock = new Intl.DateTimeFormat("hu-HU", {
  timeZone: STUDIO_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormats = {
  weekday: { weekday: "long" },
  short: { month: "short", day: "numeric" },
  month: { month: "long" },
  day: { day: "numeric" },
  full: {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatDate(date: string, format: keyof typeof dateFormats): string {
  let formatter = dateFormatters.get(format);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("hu-HU", {
      timeZone: "UTC",
      ...dateFormats[format],
    });
    dateFormatters.set(format, formatter);
  }
  return formatter.format(new Date(`${date}T00:00:00Z`));
}

// Hungarian writes weekdays and months in lower case mid-sentence; a label is not
// mid-sentence.
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatTime(instant: Date): string {
  return clock.format(instant);
}

/** "2026. szeptember 2., szerda" — the date under the dashboard's greeting. */
export function formatFullDate(date: string): string {
  return formatDate(date, "full");
}

/**
 * "18:00 – 20:00", or the span of dates when there is no clock. A multi-day event saying
 * only "Egész nap" is the one thing a reader cannot act on — it never says when it ends.
 */
export function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) {
    return event.endDate === event.date
      ? "Egész nap"
      : formatDateRange(event.date, event.endDate);
  }
  if (!event.endsAt) return formatTime(event.startsAt);
  return `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`;
}

/** "Ma", "Holnap", "Szerda" inside the coming week, "Szept. 23." beyond it. */
export function formatDayLabel(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return "Ma";
  if (days === 1) return "Holnap";
  if (days > 1 && days < 7) return capitalize(formatDate(date, "weekday"));
  return capitalize(formatDate(date, "short"));
}

/** "szept. 14 – 20.", collapsing the month when both ends share one. */
export function formatDateRange(start: string, end: string): string {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const to = sameMonth
    ? `${formatDate(end, "day")}.`
    : formatDate(end, "short");
  return `${formatDate(start, "short").replace(/\.$/, "")} – ${to}`;
}

/**
 * The two nearest weeks are named, the rest are dated. A named week keeps its range as a
 * subtitle; a dated one already is its range, so there is nothing left to repeat.
 */
export function formatWeekHeading(
  week: CalendarWeek,
  today: string,
): { title: string; range: string | null } {
  const range = formatDateRange(week.start, week.end);
  const thisWeek = startOfWeek(today);

  if (week.start === thisWeek) return { title: "Ezen a héten", range };
  if (week.start === addDays(thisWeek, 7)) {
    return { title: "Jövő héten", range };
  }
  return { title: capitalize(range), range: null };
}

/** The date block the hero leads with. */
export function formatHeroDate(date: string): {
  weekday: string;
  day: string;
  month: string;
} {
  return {
    weekday: capitalize(formatDate(date, "weekday")),
    day: formatDate(date, "day"),
    month: formatDate(date, "month"),
  };
}

/** How far off the hero's event is, in the fewest words that stay true. */
export function formatCountdown(
  event: CalendarEvent,
  now: Date,
  today: string,
): string {
  const days = daysBetween(today, event.date);

  if (event.allDay) {
    if (days < 0) return "Most tart";
    if (days === 0) return "Ma";
    if (days === 1) return "Holnap";
    return `${days} nap múlva`;
  }

  const untilStart = event.startsAt.getTime() - now.getTime();
  if (untilStart <= 0) return "Most zajlik";
  if (days === 1) return "Holnap";
  if (days > 1) return `${days} nap múlva`;

  const minutes = Math.round(untilStart / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} perc múlva`;
  return `Ma, ${Math.round(minutes / 60)} óra múlva`;
}

/** What the hero calls the event it is showing. */
export function formatHeroKicker(
  event: CalendarEvent,
  running: boolean,
): string {
  if (!running) return "Következő esemény";
  return event.allDay ? "Most tart" : "Most zajlik";
}

/** When something already under way finishes: "Ma 04:00-ig", "Még 2 napig". */
export function formatUntil(event: CalendarEvent, today: string): string {
  if (event.allDay) {
    const remaining = daysBetween(today, event.endDate);
    if (remaining <= 0) return "Ma ér véget";
    if (remaining === 1) return "Holnapig";
    return `Még ${remaining} napig`;
  }

  if (!event.endsAt) return "Folyamatban";

  const ends = formatTime(event.endsAt);
  const days = daysBetween(today, event.endDate);
  if (days <= 0) return `Ma ${ends}-ig`;
  if (days === 1) return `Holnap ${ends}-ig`;
  return `${formatDayLabel(event.endDate, today)} ${ends}-ig`;
}
