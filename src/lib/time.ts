// All game dates are JST calendar dates (see docs/decisions.md ADR-007).
// The database is the source of truth for "now"; these helpers are for display and form defaults only.

export const TIME_ZONE = "Asia/Tokyo";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" in JST. */
export function jstDateString(at: Date = new Date()): string {
  return dateFormatter.format(at);
}

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "HH:mm" in JST. */
export function formatJstTime(at: Date | string): string {
  return timeFormatter.format(typeof at === "string" ? new Date(at) : at);
}

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "10/16(木) 21:00" in JST. */
export function formatJstDateTime(at: Date | string): string {
  return dateTimeFormatter.format(typeof at === "string" ? new Date(at) : at);
}
