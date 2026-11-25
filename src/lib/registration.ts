/**
 * Van registrations: how long one has left, and which reminder is due.
 *
 * Pure, so the rules can be read and tested without Firestore or email. Dates
 * are calendar dates, `YYYY-MM-DD`, compared as days in the station timezone
 * — "today" comes from stationDateKey, never the device clock's own zone.
 */

/** The days before expiry a reminder goes out on, latest first. */
export const REMINDER_DAYS = [7, 5, 3, 1] as const;

/** A registration date as stored: `YYYY-MM-DD`, or "" for none typed yet. */
export function isRegistrationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Whole days from `today` to `expires`, both `YYYY-MM-DD`. 0 is the day it
 * expires, negative is past it. Calendar arithmetic in UTC, so no daylight
 * saving change can make a day 23 or 25 hours long.
 */
export function daysUntil(expires: string, today: string): number {
  const ms =
    Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Which reminder is due today, given the ones already sent, or null.
 *
 * Normally that is exactly 7, then 5, then 3, then 1. But a run can be missed,
 * and a van can be typed in with four days already left — so the due reminder
 * is the smallest step not yet sent that today has reached. With four days
 * left and nothing sent, that is 5: one email saying "4 days", not two in a
 * row. Sending it marks every step down to today as done — see markSent.
 *
 * Nothing on or after the expiry day: the last reminder is the day before.
 */
export function dueReminder(daysLeft: number, sent: readonly number[]): number | null {
  if (daysLeft < 1) return null;
  const reached = REMINDER_DAYS.filter(
    (step) => step >= daysLeft && !sent.includes(step),
  );
  return reached.length > 0 ? Math.min(...reached) : null;
}

/** The steps a reminder sent with `daysLeft` to go covers, merged with `sent`. */
export function markSent(daysLeft: number, sent: readonly number[]): number[] {
  const covered = REMINDER_DAYS.filter((step) => step >= daysLeft);
  return [...new Set([...sent, ...covered])].sort((a, b) => b - a);
}

/** How the vans database shows a registration. */
export type RegistrationState = "none" | "ok" | "soon" | "expired";

export function registrationState(expires: string, today: string): RegistrationState {
  if (!isRegistrationDate(expires)) return "none";
  const left = daysUntil(expires, today);
  if (left < 0) return "expired";
  if (left <= REMINDER_DAYS[0]) return "soon";
  return "ok";
}

/** "Dec 1, 2026" — a stored date for people. Read in UTC, so it never shifts a day. */
export function registrationLabel(expires: string): string {
  if (!isRegistrationDate(expires)) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${expires}T12:00:00Z`));
}

/** "in 7 days", "tomorrow", "today", "3 days ago". */
export function daysLeftPhrase(daysLeft: number): string {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === -1) return "yesterday";
  return daysLeft > 0 ? `in ${daysLeft} days` : `${-daysLeft} days ago`;
}
