import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/lib/google/calendar";

const listCalendarEvents = vi.fn();
const isGoogleCalendarConfigured = vi.fn(() => true);
const warn = vi.fn();

vi.mock("@/lib/google/calendar", () => ({
  listCalendarEvents: (...args: unknown[]) => listCalendarEvents(...args),
  isGoogleCalendarConfigured: () => isGoogleCalendarConfigured(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: (...args: unknown[]) => warn(...args) },
}));

// A Wednesday, 14:00 in Budapest. Its week runs Monday 2026-09-14 to Sunday 2026-09-20.
const NOW = new Date("2026-09-16T12:00:00Z");
const MONDAYS = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"];

function timed(id: string, start: string, end: string | null): CalendarEvent {
  return {
    id,
    title: id,
    location: null,
    url: null,
    allDay: false,
    date: start.slice(0, 10),
    endDate: (end ?? start).slice(0, 10),
    startsAt: new Date(start),
    endsAt: end ? new Date(end) : null,
  };
}

function allDay(id: string, date: string, endDate = date): CalendarEvent {
  return {
    id,
    title: id,
    location: null,
    url: null,
    allDay: true,
    date,
    endDate,
    startsAt: null,
    endsAt: null,
  };
}

async function getCalendar(now: Date = NOW) {
  const { getDashboardCalendar } = await import("@/lib/services/calendar");
  return getDashboardCalendar(now);
}

beforeEach(async () => {
  vi.resetModules();
  listCalendarEvents.mockReset().mockResolvedValue([]);
  isGoogleCalendarConfigured.mockReset().mockReturnValue(true);
  warn.mockReset();
  const { clearCalendarCache } = await import("@/lib/services/calendar");
  clearCalendarCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getDashboardCalendar", () => {
  it("reports an unconfigured calendar without calling Google", async () => {
    isGoogleCalendarConfigured.mockReturnValue(false);

    await expect(getCalendar()).resolves.toEqual({ status: "unconfigured" });
    expect(listCalendarEvents).not.toHaveBeenCalled();
  });

  it("asks for a window whose bounds hold still for the whole studio day", async () => {
    await getCalendar();
    // 22:00 in Budapest, still the same day there.
    await getCalendar(new Date("2026-09-16T20:00:00Z"));

    // Both land on the same cache entry, so Google is only asked once.
    expect(listCalendarEvents).toHaveBeenCalledTimes(1);
    const { timeMin, timeMax } = listCalendarEvents.mock.calls[0][0];
    expect(timeMin.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(timeMax.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });

  it("moves the window at studio midnight, not at UTC midnight", async () => {
    // 22:00Z is already the next day in Budapest, which is the day that counts.
    await getCalendar(new Date("2026-09-16T22:00:00Z"));

    const { timeMin } = listCalendarEvents.mock.calls[0][0];
    expect(timeMin.toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });

  it("leads with the soonest event and groups the rest into four weeks", async () => {
    listCalendarEvents.mockResolvedValue([
      timed("gyűlés", "2026-09-16T18:00:00Z", "2026-09-16T20:00:00Z"),
      timed("forgatás", "2026-09-18T09:00:00Z", "2026-09-18T15:00:00Z"),
      allDay("tábor", "2026-09-26", "2026-09-27"),
      timed("vágás", "2026-10-06T17:00:00Z", "2026-10-06T19:00:00Z"),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.running).toEqual([]);
    expect(result.next?.id).toBe("gyűlés");
    expect(result.weeks.map((week) => week.start)).toEqual(MONDAYS);
    expect(result.weeks.map((week) => week.end)).toEqual([
      "2026-09-20",
      "2026-09-27",
      "2026-10-04",
      "2026-10-11",
    ]);
    expect(result.weeks.map((week) => week.events.map((e) => e.id))).toEqual([
      ["forgatás"],
      ["tábor"],
      [],
      ["vágás"],
    ]);
  });

  it("groups an event already under way under today, not the week it began in", async () => {
    listCalendarEvents.mockResolvedValue([
      allDay("tábor", "2026-09-13", "2026-09-18"),
      timed("gyűlés", "2026-09-16T18:00:00Z", "2026-09-16T20:00:00Z"),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    // The hero takes it, and the one after it lands in the current week rather than being
    // dropped for belonging to a Monday the window no longer covers.
    expect(result.running.map((event) => event.id)).toEqual(["tábor"]);
    expect(result.weeks[0].events.map((event) => event.id)).toEqual(["gyűlés"]);
  });

  it("leads with the shortest running event, not the umbrella it sits inside", async () => {
    listCalendarEvents.mockResolvedValue([
      allDay("fesztiválhét", "2026-09-14", "2026-09-18"),
      timed("buli", "2026-09-16T11:00:00Z", "2026-09-16T18:00:00Z"),
      timed("gyűlés", "2026-09-18T18:00:00Z", "2026-09-18T20:00:00Z"),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    // A seven-hour party is more specific than the week it belongs to.
    expect(result.running.map((event) => event.id)).toEqual([
      "buli",
      "fesztiválhét",
    ]);
    // `next` is the soonest that has *not* started, so the hero can point at it.
    expect(result.next?.id).toBe("gyűlés");
    // Everything the hero renders is left out of the list; the rest stays.
    expect(result.weeks[0].events.map((event) => event.id)).toEqual(["gyűlés"]);
  });

  it("has no next to point at when everything ahead is already running", async () => {
    listCalendarEvents.mockResolvedValue([
      allDay("fesztiválhét", "2026-09-14", "2026-09-18"),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.running.map((event) => event.id)).toEqual(["fesztiválhét"]);
    expect(result.next).toBeNull();
    expect(result.weeks.every((week) => week.events.length === 0)).toBe(true);
  });

  it("measures a timed event with no end as instantaneous when ranking", async () => {
    listCalendarEvents.mockResolvedValue([
      allDay("nap", "2026-09-16"),
      // Starting exactly now is the only moment an end-less event is both still ahead and
      // already running — a second later it counts as over.
      timed("pillanat", NOW.toISOString(), null),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.running.map((event) => event.id)).toEqual([
      "pillanat",
      "nap",
    ]);
  });

  it("clamps a following event that also began before today", async () => {
    listCalendarEvents.mockResolvedValue([
      allDay("hosszú tábor", "2026-09-13", "2026-09-18"),
      allDay("rövid tábor", "2026-09-14", "2026-09-17"),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    // The second one is grouped too, and lands in the current week rather than in the
    // Monday bucket its own start date would point at.
    // Both are running, so both belong to the hero and neither reaches the list.
    expect(result.running.map((event) => event.id)).toEqual([
      "rövid tábor",
      "hosszú tábor",
    ]);
    expect(result.weeks[0].events).toEqual([]);
  });

  it("keeps an event still running and drops one that has finished", async () => {
    listCalendarEvents.mockResolvedValue([
      timed("reggeli", "2026-09-16T08:00:00Z", "2026-09-16T09:00:00Z"),
      timed("mostani", "2026-09-16T11:30:00Z", "2026-09-16T13:00:00Z"),
      allDay("tegnapi", "2026-09-15"),
      allDay("mai", "2026-09-16"),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.running.map((event) => event.id)).toEqual(["mostani", "mai"]);
    expect(result.weeks[0].events).toEqual([]);
  });

  it("treats a timed event with no end as ahead only until it starts", async () => {
    listCalendarEvents.mockResolvedValue([
      timed("elmúlt", "2026-09-16T09:00:00Z", null),
      timed("jövő", "2026-09-16T19:00:00Z", null),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.running).toEqual([]);
    expect(result.next?.id).toBe("jövő");
  });

  it("drops an event past the last week the window groups", async () => {
    listCalendarEvents.mockResolvedValue([
      allDay("bent", "2026-10-11"),
      allDay("kint", "2026-10-12"),
    ]);

    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.next?.id).toBe("bent");
    expect(result.weeks[3].events).toEqual([]);
    expect(result.running).toEqual([]);
  });

  it("answers with four empty weeks on an empty calendar", async () => {
    const result = await getCalendar();
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.next).toBeNull();
    expect(result.running).toEqual([]);
    expect(result.weeks).toHaveLength(4);
    expect(result.weeks.every((week) => week.events.length === 0)).toBe(true);
  });
});

describe("caching", () => {
  it("serves a second read from the cache and refetches once it expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    listCalendarEvents.mockResolvedValue([allDay("tábor", "2026-09-18")]);

    await getCalendar();
    await getCalendar();
    expect(listCalendarEvents).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60_000 + 1));
    await getCalendar();
    expect(listCalendarEvents).toHaveBeenCalledTimes(2);
  });

  it("reports a failed read, logs it, and holds off before retrying", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    listCalendarEvents.mockRejectedValue(new Error("403 Forbidden"));

    await expect(getCalendar()).resolves.toEqual({ status: "unavailable" });
    expect(warn).toHaveBeenCalledWith("calendar_read_failed", {
      error: "403 Forbidden",
    });

    await expect(getCalendar()).resolves.toEqual({ status: "unavailable" });
    expect(listCalendarEvents).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    listCalendarEvents.mockResolvedValue([]);
    const result = await getCalendar();

    expect(result.status).toBe("ok");
    expect(listCalendarEvents).toHaveBeenCalledTimes(2);
  });

  it("replaces the entry when the studio day moves the window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    listCalendarEvents.mockResolvedValue([]);

    await getCalendar();
    // The next studio day asks for a window of its own, and the entry it caches is the
    // only one left — a stale window is never served and never kept.
    const tomorrow = new Date("2026-09-17T12:00:00Z");
    vi.setSystemTime(tomorrow);
    await getCalendar(tomorrow);
    await getCalendar(tomorrow);
    await getCalendar(NOW);

    expect(
      listCalendarEvents.mock.calls.map((call) =>
        call[0].timeMin.toISOString(),
      ),
    ).toEqual([
      "2026-09-15T00:00:00.000Z",
      "2026-09-16T00:00:00.000Z",
      "2026-09-15T00:00:00.000Z",
    ]);
  });

  it("logs a rejection that is not an Error", async () => {
    listCalendarEvents.mockRejectedValue("kapcsolat megszakadt");

    await expect(getCalendar()).resolves.toEqual({ status: "unavailable" });
    expect(warn).toHaveBeenCalledWith("calendar_read_failed", {
      error: "kapcsolat megszakadt",
    });
  });
});
