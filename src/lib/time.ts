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

const dayFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

/** "10/20(火)" for a JST calendar date ("YYYY-MM-DD") or an instant. */
export function formatJstDay(value: string | Date): string {
  const at = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+09:00`) : new Date(value);
  return dayFormatter.format(at);
}

/** "YYYY-MM-DD" shifted by whole days (calendar arithmetic, no time zone involved). */
export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Sunday that starts the week (weeks run Sunday-Saturday, like settlements). */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}
