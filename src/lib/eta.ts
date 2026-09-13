/**
 * Reading an ETA well enough to sort by it.
 *
 * The dispatcher types an ETA the way the driver said it — "9:45", "10", "12:10"
 * — and that string is never rewritten. This file only interprets it, so the
 * closer's list can order by who is due next and tint whoever is late. Anything
 * it cannot read sorts to the bottom and is simply never called overdue.
 */

import { STATION_TIMEZONE } from "@/lib/constants";

/**
 * A bare hour above this one is the evening.
 *
 * "5" typed into the ETA box is five in the afternoon; "3" is three in the
 * morning, at the far end of a close that has run long. Four is the hinge.
 *
 * It used to be NIGHT_ROLLOVER_HOUR, which read as the same idea and is not.
 * That one says when a night's sheet stops being tonight's, and it moved to
 * seven so a forgotten EOD sheet survives until the morning shift — at which
 * point every ETA of "5" and "6" in the station would have started meaning
 * breakfast. Two numbers, two jobs, and they are only equal by coincidence.
 */
const EVENING_AFTER_HOUR = 4;

/**
 * Minutes since noon — the timeline a close actually runs on.
 *
 * A night crosses midnight, so raw clock hours sort wrongly: 12:10am has to
 * come *after* 11:50pm, not eleven hours before it. Counting from noon puts the
 * whole shift on one increasing line.
 */
function nightMinutes(hours24: number, minutes: number): number {
  return ((hours24 + 12) % 24) * 60 + minutes;
}

/** `9:45`, `945`, `9.45 pm`, `21:30`, `10` — all of it, or null. */
const ETA_PATTERN = /^(\d{1,2})\s*[:.]?\s*(\d{2})?\s*(?:([ap])\.?\s*m?\.?)?$/i;

/**
 * Where an ETA sits on tonight's timeline, or null if it cannot be read.
 *
 * Bare hours are resolved the way the yard means them, not the way a clock
 * would: 5 through 11 are evening, 12 is after midnight rather than noon, and
 * 1 through 4 are the small hours. Anything with am/pm attached is taken at its
 * word.
 */
export function etaMinutes(raw: string): number | null {
  const match = ETA_PATTERN.exec(raw.trim().toLowerCase());
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (hours > 23 || minutes > 59) return null;

  if (meridiem) {
    hours = hours % 12;
    if (meridiem === "p") hours += 12;
  } else if (hours === 12) {
    hours = 0;
  } else if (hours > EVENING_AFTER_HOUR && hours < 12) {
    hours += 12;
  }

  return nightMinutes(hours, minutes);
}

/** Where we are on tonight's timeline right now, in station time. */
export function stationNowMinutes(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATION_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? "0");

  return nightMinutes(part("hour"), part("minute"));
}

/**
 * How late a driver is, or null when he is not.
 *
 * Null covers three different things on purpose — no ETA given, an ETA we
 * could not read, and an ETA that has not passed yet. None of them should tint
 * a card red.
 */
export function minutesLate(eta: string, now: number | null): number | null {
  if (now === null) return null;
  const due = etaMinutes(eta);
  if (due === null) return null;
  const late = now - due;
  return late > 0 ? late : null;
}

/** "14m late", "1h 12m late". */
export function lateLabel(late: number): string {
  if (late < 60) return `${late}m late`;
  const hours = Math.floor(late / 60);
  const rest = late % 60;
  return rest === 0 ? `${hours}h late` : `${hours}h ${rest}m late`;
}

/**
 * How this driver did against the time he gave, signed.
 *
 * Positive is early, negative is late, and the sign is the whole point — one
 * number that says both which side of the ETA he landed on and by how far,
 * which is what Karim is reading in the second before he clocks somebody out.
 *
 * `against` is whatever the honest reference is at the moment it is asked for:
 * the clock while he is still out or stood at the van, and the stamped
 * clock-out once the handover is over. That is why it is a parameter — a sheet
 * reopened an hour later must not carry on counting up on a man who went home.
 */
export function etaOffset(eta: string, against: number | null): number | null {
  if (against === null) return null;
  const due = etaMinutes(eta);
  if (due === null) return null;
  return due - against;
}

/**
 * The signed offset as Karim reads it out: "+12 mins", "-24 mins".
 *
 * Minutes for anything inside the hour, which is every figure this was asked
 * for — a handover runs on how many minutes either side of the time he gave.
 *
 * Hours above that, and it is not tidiness. A driver entered at five with an
 * ETA of half ten is five and a half hours early, and "+330 mins" is a number
 * nobody reads as anything; it looks like the app has lost count. "+5h 30m" is
 * the same fact and is obviously a driver who has not left yet.
 *
 * Bang on the minute gets words rather than a "+0" — nought early and nought
 * late are the same thing, and it is worth saying so.
 */
export function offsetLabel(offset: number): string {
  if (offset === 0) return "On time";

  const sign = offset > 0 ? "+" : "-";
  const size = Math.abs(offset);
  if (size < 60) return `${sign}${size} mins`;

  const hours = Math.floor(size / 60);
  const rest = size % 60;
  return rest === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${rest}m`;
}
