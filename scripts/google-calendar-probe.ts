import "dotenv/config";
import {
  getCalendarId,
  isGoogleCalendarConfigured,
  listCalendarEvents,
} from "../lib/google/calendar";
import { STUDIO_TIME_ZONE } from "../types";
import { done, fail, info, step } from "./utils";

const DEFAULT_DAYS = 28;

function days(): number {
  const flag = process.argv.slice(2).find((arg) => arg.startsWith("--days="));
  const parsed = Number(flag?.slice("--days=".length));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAYS;
}

const time = new Intl.DateTimeFormat("hu-HU", {
  timeZone: STUDIO_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

async function main() {
  if (!isGoogleCalendarConfigured()) {
    fail(
      "GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CALENDAR_ID is not set — see .env.example.",
    );
  }

  const window = days();
  const timeMin = new Date();
  const timeMax = new Date(timeMin.getTime() + window * 86_400_000);

  step(`Reading ${getCalendarId()} for the next ${window} day(s)`);
  try {
    const events = await listCalendarEvents({ timeMin, timeMax });
    for (const event of events) {
      const when = event.startsAt
        ? `${event.date} ${time.format(event.startsAt)}`
        : `${event.date} egész nap`;
      info(
        `${when}  ${event.title}${event.location ? ` — ${event.location}` : ""}`,
      );
    }
    done(`${events.length} event(s)`);
  } catch (error) {
    // A share that never landed reads as 404 rather than 403: the service account cannot
    // see the calendar at all, so the API answers as if it did not exist.
    const message = error instanceof Error ? error.message : String(error);
    fail(
      message.includes("404") || message.includes("Not Found")
        ? `${message}\n  The calendar is not shared with the service account, or the id is wrong.`
        : message,
    );
  }
}

main();
