import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { cache } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCountdown,
  formatDayLabel,
  formatEventTime,
  formatHeroDate,
  formatHeroKicker,
  formatUntil,
  formatWeekHeading,
} from "@/lib/calendar";
import type { CalendarEvent } from "@/lib/google/calendar";
import {
  type DashboardCalendar,
  getDashboardCalendar,
} from "@/lib/services/calendar";
import { civilDate } from "@/types";

const readCalendar = cache(
  async (): Promise<{ calendar: DashboardCalendar; now: Date }> => {
    const now = new Date();
    return { calendar: await getDashboardCalendar(now), now };
  },
);

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/10">
      <CalendarDays className="size-4 shrink-0" />
      {children}
    </div>
  );
}

function DetailsLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-accent"
    >
      Részletek
      <ExternalLink className="size-3" />
    </a>
  );
}

function EventRow({ event, today }: { event: CalendarEvent; today: string }) {
  return (
    <div className="flex items-baseline gap-3 border-t py-2.5 first:border-t-0 first:pt-0">
      <span className="w-28 shrink-0 font-mono text-xs tabular-nums">
        <span className="block font-semibold">
          {formatDayLabel(event.date, today)}
        </span>
        <span className="block whitespace-nowrap text-muted-foreground">
          {formatEventTime(event)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{event.title}</span>
        {event.location && (
          <span className="block text-xs text-muted-foreground">
            {event.location}
          </span>
        )}
      </span>
      {event.url && <DetailsLink url={event.url} />}
    </div>
  );
}

function ContextRow({
  label,
  event,
  detail,
}: {
  label: string;
  event: CalendarEvent;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-2.5">
      <span className="w-20 shrink-0 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{event.title}</span>
        <span className="text-muted-foreground"> · {detail}</span>
      </span>
    </div>
  );
}

/**
 * What to walk in for. The shortest event under way wins the card — a party inside a
 * festival week says more than the week does — and anything else running, plus whatever
 * follows, gets a line underneath.
 */
export async function HeroEvent() {
  const { calendar, now } = await readCalendar();
  if (calendar.status !== "ok") return null;

  const running = calendar.running;
  const hero = running[0] ?? calendar.next;
  if (!hero) return null;

  const today = civilDate(now);
  const isRunning = running.length > 0;
  const { weekday, day, month } = formatHeroDate(hero.date);
  const alongside = running.slice(1);
  // Only worth pointing at when the hero is not already it.
  const upNext = isRunning ? calendar.next : null;

  return (
    <div className="flex flex-col gap-3.5 rounded-xl bg-card bg-gradient-to-br from-primary/10 to-transparent to-60% p-5 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-22 shrink-0 border-r pr-4 text-center">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            {weekday}
          </div>
          <div className="text-4xl font-bold leading-none tracking-tight">
            {day}
          </div>
          <div className="text-xs text-muted-foreground">{month}</div>
        </div>

        <div className="flex min-w-52 flex-1 flex-col gap-0.5">
          <div className="inline-flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
            {isRunning && (
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            )}
            {formatHeroKicker(hero, isRunning)}
          </div>
          <div className="text-lg font-semibold tracking-tight">
            {hero.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">
              {formatEventTime(hero)}
            </span>
            {hero.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {hero.location}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-sm font-semibold whitespace-nowrap">
            {isRunning
              ? formatUntil(hero, today)
              : formatCountdown(hero, now, today)}
          </span>
          {hero.url && <DetailsLink url={hero.url} />}
        </div>
      </div>

      {(alongside.length > 0 || upNext) && (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          {alongside.map((event) => (
            <ContextRow
              key={event.id}
              label="Közben"
              event={event}
              detail={`${formatEventTime(event)} · ${formatUntil(event, today)}`}
            />
          ))}
          {upNext && (
            <ContextRow
              label="Utána"
              event={upNext}
              detail={`${formatDayLabel(upNext.date, today).toLowerCase()}${
                upNext.allDay ? "" : ` ${formatEventTime(upNext)}`
              }`}
            />
          )}
        </div>
      )}
    </div>
  );
}

export async function UpcomingEvents() {
  const { calendar, now } = await readCalendar();

  if (calendar.status === "unconfigured") {
    return <Notice>Nincs naptár beállítva.</Notice>;
  }
  if (calendar.status === "unavailable") {
    return <Notice>A naptár most nem érhető el. Próbáld újra később.</Notice>;
  }

  const today = civilDate(now);
  const listed = calendar.weeks.reduce(
    (sum, week) => sum + week.events.length,
    0,
  );
  const hasHero = calendar.running.length > 0 || calendar.next !== null;

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <CalendarDays className="size-4 text-primary" />
        <CardTitle className="flex-1 text-sm">
          {hasHero ? "További események" : "Közelgő események"}
        </CardTitle>
        <span className="font-mono text-xs text-muted-foreground">
          {listed === 0 ? "—" : `${listed} esemény`}
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {calendar.weeks.map((week) => {
          const { title, range } = formatWeekHeading(week, today);
          return (
            <div key={week.start} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{title}</span>
                {range && (
                  <span className="font-normal normal-case tracking-normal">
                    {range}
                  </span>
                )}
                <span className="h-px flex-1 bg-border" />
                {week.events.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 font-semibold text-foreground">
                    {week.events.length}
                  </span>
                )}
              </div>

              {week.events.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">
                  Nincs meghirdetett esemény.
                </p>
              ) : (
                <div className="flex flex-col">
                  {week.events.map((event) => (
                    <EventRow key={event.id} event={event} today={today} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
