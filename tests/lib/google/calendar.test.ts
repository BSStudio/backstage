import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleFetch = vi.fn();

vi.mock("@/lib/google/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/client")>()),
  googleFetch: (...args: unknown[]) => googleFetch(...args),
}));

async function importCalendar() {
  vi.resetModules();
  return import("@/lib/google/calendar");
}

const TIME_MIN = new Date("2026-09-01T00:00:00Z");
const TIME_MAX = new Date("2026-09-29T00:00:00Z");

function query(call: number): URLSearchParams {
  return new URL(googleFetch.mock.calls[call][0] as string).searchParams;
}

beforeEach(() => {
  googleFetch.mockReset().mockResolvedValue({});
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "a-key");
  vi.stubEnv("GOOGLE_CALENDAR_ID", "studio@group.calendar.google.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isGoogleCalendarConfigured", () => {
  it("is true when both variables are set", async () => {
    const { isGoogleCalendarConfigured } = await importCalendar();
    expect(isGoogleCalendarConfigured()).toBe(true);
  });

  it("is false when the key is missing", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "");
    const { isGoogleCalendarConfigured } = await importCalendar();
    expect(isGoogleCalendarConfigured()).toBe(false);
  });

  it("is false when the calendar id is missing", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_ID", "");
    const { isGoogleCalendarConfigured } = await importCalendar();
    expect(isGoogleCalendarConfigured()).toBe(false);
  });
});

describe("getCalendarId", () => {
  it("returns the configured calendar", async () => {
    const { getCalendarId } = await importCalendar();
    expect(getCalendarId()).toBe("studio@group.calendar.google.com");
  });

  it("throws when unset", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_ID", "");
    const { getCalendarId } = await importCalendar();
    expect(() => getCalendarId()).toThrow("Missing GOOGLE_CALENDAR_ID");
  });
});

describe("listCalendarEvents", () => {
  it("expands recurrences, orders by start and asks for the read-only scope", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        {
          id: "e1",
          summary: "  Stúdiógyűlés  ",
          location: "  Klubhelyiség  ",
          start: { dateTime: "2026-09-02T18:00:00+02:00" },
          end: { dateTime: "2026-09-02T20:00:00+02:00" },
        },
      ],
    });

    const { listCalendarEvents, GOOGLE_SCOPE_CALENDAR_READONLY } =
      await importCalendar();

    await expect(
      listCalendarEvents({ timeMin: TIME_MIN, timeMax: TIME_MAX }),
    ).resolves.toEqual([
      {
        id: "e1",
        title: "Stúdiógyűlés",
        location: "Klubhelyiség",
        allDay: false,
        date: "2026-09-02",
        endDate: "2026-09-02",
        startsAt: new Date("2026-09-02T18:00:00+02:00"),
        endsAt: new Date("2026-09-02T20:00:00+02:00"),
      },
    ]);

    const [url, options] = googleFetch.mock.calls[0];
    expect(url).toContain(
      "/calendars/studio%40group.calendar.google.com/events?",
    );
    expect(options).toEqual({ scope: GOOGLE_SCOPE_CALENDAR_READONLY });

    const params = query(0);
    expect(params.get("timeMin")).toBe(TIME_MIN.toISOString());
    expect(params.get("timeMax")).toBe(TIME_MAX.toISOString());
    expect(params.get("singleEvents")).toBe("true");
    expect(params.get("orderBy")).toBe("startTime");
    expect(params.get("showDeleted")).toBe("false");
    expect(params.get("timeZone")).toBe("Europe/Budapest");
  });

  it("keeps an all-day event's own date rather than deriving one from an instant", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        {
          id: "e2",
          summary: "Egynapos tábor",
          start: { date: "2026-09-14" },
          end: { date: "2026-09-15" },
        },
      ],
    });

    const { listCalendarEvents } = await importCalendar();
    const [event] = await listCalendarEvents({
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
    });

    // A Monday all-day event: UTC midnight would place it in the previous week.
    expect(event).toEqual({
      id: "e2",
      title: "Egynapos tábor",
      location: null,
      allDay: true,
      date: "2026-09-14",
      endDate: "2026-09-14",
      startsAt: null,
      endsAt: null,
    });
  });

  it("steps back from the exclusive end of a multi-day all-day event", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        {
          id: "e10",
          summary: "Többnapos tábor",
          start: { date: "2026-09-18" },
          end: { date: "2026-09-22" },
        },
      ],
    });

    const { listCalendarEvents } = await importCalendar();
    const [event] = await listCalendarEvents({
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
    });

    expect(event).toMatchObject({ date: "2026-09-18", endDate: "2026-09-21" });
  });

  it("keeps a malformed all-day range on its start date", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        {
          id: "e11",
          summary: "Elrontott",
          start: { date: "2026-09-10" },
          end: { date: "2026-09-09" },
        },
      ],
    });

    const { listCalendarEvents } = await importCalendar();
    const [event] = await listCalendarEvents({
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
    });

    expect(event.endDate).toBe("2026-09-10");
  });

  it("carries a timed event past midnight to the next date", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        {
          id: "e12",
          summary: "Éjszakai buli",
          start: { dateTime: "2026-09-19T21:00:00+02:00" },
          end: { dateTime: "2026-09-20T04:00:00+02:00" },
        },
      ],
    });

    const { listCalendarEvents } = await importCalendar();
    const [event] = await listCalendarEvents({
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
    });

    expect(event).toMatchObject({ date: "2026-09-19", endDate: "2026-09-20" });
  });

  it("resolves the civil date in the studio zone, not the server's", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        {
          id: "e3",
          summary: "Hajnali vágás",
          // 00:30 in Budapest on the 5th is still the 4th in UTC.
          start: { dateTime: "2026-09-05T00:30:00+02:00" },
          end: { dateTime: "2026-09-05T02:00:00+02:00" },
        },
      ],
    });

    const { listCalendarEvents } = await importCalendar();
    const [event] = await listCalendarEvents({
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
    });

    expect(event.date).toBe("2026-09-05");
  });

  it("falls back to a placeholder title and a null end", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        {
          id: "e4",
          summary: "   ",
          location: "  ",
          start: { dateTime: "2026-09-03T10:00:00+02:00" },
        },
      ],
    });

    const { listCalendarEvents } = await importCalendar();
    const [event] = await listCalendarEvents({
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
    });

    expect(event).toMatchObject({
      title: "(Névtelen esemény)",
      location: null,
      endsAt: null,
      date: "2026-09-03",
      endDate: "2026-09-03",
    });
  });

  it("drops an entry with no id and one with neither a date nor a dateTime", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        { summary: "Nincs azonosító", start: { date: "2026-09-04" } },
        { id: "e5", summary: "Nincs kezdés", start: {} },
        { id: "e6", summary: "Nincs start mező" },
      ],
    });

    const { listCalendarEvents } = await importCalendar();
    await expect(
      listCalendarEvents({ timeMin: TIME_MIN, timeMax: TIME_MAX }),
    ).resolves.toEqual([]);
  });

  it("follows pagination and tolerates a page with no items", async () => {
    googleFetch
      .mockResolvedValueOnce({
        items: [{ id: "e7", summary: "Első", start: { date: "2026-09-02" } }],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        items: [
          { id: "e8", summary: "Második", start: { date: "2026-09-03" } },
        ],
        nextPageToken: "page-3",
      })
      .mockResolvedValueOnce({});

    const { listCalendarEvents } = await importCalendar();
    const events = await listCalendarEvents({
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
    });

    expect(events.map((event) => event.id)).toEqual(["e7", "e8"]);
    expect(query(1).get("pageToken")).toBe("page-2");
    expect(query(2).get("pageToken")).toBe("page-3");
  });

  it("stops after the page cap rather than following a token forever", async () => {
    googleFetch.mockResolvedValue({ items: [], nextPageToken: "next" });

    const { listCalendarEvents } = await importCalendar();
    await listCalendarEvents({ timeMin: TIME_MIN, timeMax: TIME_MAX });

    expect(googleFetch).toHaveBeenCalledTimes(5);
  });

  it("accepts an explicit calendar and zone", async () => {
    googleFetch.mockResolvedValueOnce({
      items: [
        {
          id: "e9",
          summary: "Távoli forgatás",
          start: { dateTime: "2026-09-05T00:30:00+02:00" },
        },
      ],
    });

    const { listCalendarEvents } = await importCalendar();
    const [event] = await listCalendarEvents({
      timeMin: TIME_MIN,
      timeMax: TIME_MAX,
      calendarId: "other@example.com",
      timeZone: "Asia/Tokyo",
    });

    expect(googleFetch.mock.calls[0][0]).toContain(
      "/calendars/other%40example.com/events?",
    );
    expect(query(0).get("timeZone")).toBe("Asia/Tokyo");
    expect(event.date).toBe("2026-09-05");
  });
});
