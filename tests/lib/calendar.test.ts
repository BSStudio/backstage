import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatDateRange,
  formatDayLabel,
  formatEventTime,
  formatFullDate,
  formatHeroDate,
  formatHeroKicker,
  formatTime,
  formatUntil,
  formatWeekHeading,
} from "@/lib/calendar";
import type { CalendarEvent } from "@/lib/google/calendar";
import type { CalendarWeek } from "@/lib/services/calendar";

// A Wednesday. Its week runs Monday 2026-09-14 to Sunday 2026-09-20.
const TODAY = "2026-09-16";
const NOW = new Date("2026-09-16T12:00:00Z"); // 14:00 in Budapest

function timed(start: string, end: string | null = null): CalendarEvent {
  return {
    id: "e",
    title: "Esemény",
    location: null,
    url: null,
    allDay: false,
    date: start.slice(0, 10),
    endDate: (end ?? start).slice(0, 10),
    startsAt: new Date(start),
    endsAt: end ? new Date(end) : null,
  };
}

function allDay(date: string, endDate = date): CalendarEvent {
  return {
    id: "e",
    title: "Esemény",
    location: null,
    url: null,
    allDay: true,
    date,
    endDate,
    startsAt: null,
    endsAt: null,
  };
}

function week(start: string, end: string): CalendarWeek {
  return { start, end, events: [] };
}

describe("formatTime", () => {
  it("renders the clock at the studio, not in UTC", () => {
    expect(formatTime(new Date("2026-09-16T16:00:00Z"))).toBe("18:00");
  });
});

describe("formatFullDate", () => {
  it("spells the greeting's date out in full", () => {
    expect(formatFullDate("2026-09-02")).toBe("2026. szeptember 2., szerda");
  });
});

describe("formatEventTime", () => {
  it("renders a span", () => {
    expect(
      formatEventTime(timed("2026-09-16T16:00:00Z", "2026-09-16T18:00:00Z")),
    ).toBe("18:00 – 20:00");
  });

  it("renders only the start when there is no end", () => {
    expect(formatEventTime(timed("2026-09-16T16:00:00Z"))).toBe("18:00");
  });

  it("says so when there is no clock at all", () => {
    expect(formatEventTime(allDay("2026-09-16"))).toBe("Egész nap");
  });

  it("gives a multi-day event its span instead, so its end is visible", () => {
    expect(formatEventTime(allDay("2026-08-31", "2026-09-04"))).toBe(
      "aug. 31 – szept. 4.",
    );
  });
});

describe("formatDayLabel", () => {
  it("names today and tomorrow", () => {
    expect(formatDayLabel("2026-09-16", TODAY)).toBe("Ma");
    expect(formatDayLabel("2026-09-17", TODAY)).toBe("Holnap");
  });

  it("uses a capitalised weekday inside the coming week", () => {
    expect(formatDayLabel("2026-09-18", TODAY)).toBe("Péntek");
    expect(formatDayLabel("2026-09-22", TODAY)).toBe("Kedd");
  });

  it("switches to a date once the weekday would be ambiguous", () => {
    expect(formatDayLabel("2026-09-23", TODAY)).toBe("Szept. 23.");
  });

  it("dates a day that has already passed", () => {
    expect(formatDayLabel("2026-09-13", TODAY)).toBe("Szept. 13.");
  });
});

describe("formatDateRange", () => {
  it("collapses a shared month", () => {
    expect(formatDateRange("2026-09-14", "2026-09-20")).toBe("szept. 14 – 20.");
  });

  it("keeps both months when the week straddles one", () => {
    expect(formatDateRange("2026-09-28", "2026-10-04")).toBe(
      "szept. 28 – okt. 4.",
    );
  });
});

describe("formatWeekHeading", () => {
  it("names the current week and keeps its range", () => {
    expect(formatWeekHeading(week("2026-09-14", "2026-09-20"), TODAY)).toEqual({
      title: "Ezen a héten",
      range: "szept. 14 – 20.",
    });
  });

  it("names the next one", () => {
    expect(formatWeekHeading(week("2026-09-21", "2026-09-27"), TODAY)).toEqual({
      title: "Jövő héten",
      range: "szept. 21 – 27.",
    });
  });

  it("dates the rest, with nothing left to repeat underneath", () => {
    expect(formatWeekHeading(week("2026-09-28", "2026-10-04"), TODAY)).toEqual({
      title: "Szept. 28 – okt. 4.",
      range: null,
    });
  });
});

describe("formatHeroDate", () => {
  it("splits the date into its parts", () => {
    expect(formatHeroDate("2026-09-16")).toEqual({
      weekday: "Szerda",
      day: "16",
      month: "szeptember",
    });
  });
});

describe("formatCountdown", () => {
  it("counts minutes when the event is nearly here", () => {
    expect(formatCountdown(timed("2026-09-16T12:40:00Z"), NOW, TODAY)).toBe(
      "40 perc múlva",
    );
  });

  it("never counts down to zero minutes", () => {
    expect(formatCountdown(timed("2026-09-16T12:00:20Z"), NOW, TODAY)).toBe(
      "1 perc múlva",
    );
  });

  it("counts hours later the same day", () => {
    expect(formatCountdown(timed("2026-09-16T15:00:00Z"), NOW, TODAY)).toBe(
      "Ma, 3 óra múlva",
    );
  });

  it("says an event under way is under way", () => {
    expect(
      formatCountdown(
        timed("2026-09-16T11:00:00Z", "2026-09-16T13:00:00Z"),
        NOW,
        TODAY,
      ),
    ).toBe("Most zajlik");
  });

  it("names tomorrow and counts days beyond it", () => {
    expect(formatCountdown(timed("2026-09-17T16:00:00Z"), NOW, TODAY)).toBe(
      "Holnap",
    );
    expect(formatCountdown(timed("2026-09-19T16:00:00Z"), NOW, TODAY)).toBe(
      "3 nap múlva",
    );
  });

  it("treats an all-day event by its dates alone", () => {
    expect(formatCountdown(allDay("2026-09-16"), NOW, TODAY)).toBe("Ma");
    expect(formatCountdown(allDay("2026-09-17"), NOW, TODAY)).toBe("Holnap");
    expect(formatCountdown(allDay("2026-09-21"), NOW, TODAY)).toBe(
      "5 nap múlva",
    );
  });

  it("says a multi-day event that began earlier is still running", () => {
    expect(
      formatCountdown(allDay("2026-09-14", "2026-09-18"), NOW, TODAY),
    ).toBe("Most tart");
  });
});

describe("formatHeroKicker", () => {
  it("distinguishes a clock from a stretch of days", () => {
    expect(formatHeroKicker(timed("2026-09-16T10:00:00Z"), true)).toBe(
      "Most zajlik",
    );
    expect(formatHeroKicker(allDay("2026-09-16"), true)).toBe("Most tart");
  });

  it("names an event that has not started", () => {
    expect(formatHeroKicker(timed("2026-09-18T10:00:00Z"), false)).toBe(
      "Következő esemény",
    );
  });
});

describe("formatUntil", () => {
  it("gives the closing time of something ending today or tomorrow", () => {
    expect(
      formatUntil(timed("2026-09-16T10:00:00Z", "2026-09-16T18:00:00Z"), TODAY),
    ).toBe("Ma 20:00-ig");
    expect(
      formatUntil(timed("2026-09-16T19:00:00Z", "2026-09-17T02:00:00Z"), TODAY),
    ).toBe("Holnap 04:00-ig");
  });

  it("dates a closing time further out", () => {
    expect(
      formatUntil(timed("2026-09-16T19:00:00Z", "2026-09-18T02:00:00Z"), TODAY),
    ).toBe("Péntek 04:00-ig");
  });

  it("says only that a timed event with no end is under way", () => {
    expect(formatUntil(timed("2026-09-16T10:00:00Z"), TODAY)).toBe(
      "Folyamatban",
    );
  });

  it("counts remaining days for an all-day stretch", () => {
    expect(formatUntil(allDay("2026-09-14", "2026-09-16"), TODAY)).toBe(
      "Ma ér véget",
    );
    expect(formatUntil(allDay("2026-09-14", "2026-09-17"), TODAY)).toBe(
      "Holnapig",
    );
    expect(formatUntil(allDay("2026-09-14", "2026-09-18"), TODAY)).toBe(
      "Még 2 napig",
    );
  });
});
