/**
 * Reading an ETA well enough to sort by it.
 *
 * The dispatcher types an ETA the way the driver said it — "9:45", "10", "12:10"
 * — and that string is never rewritten. This file only interprets it, so the
 * closer's list can order by who is due next and tint whoever is late. Anything
 * it cannot read sorts to the bottom and is simply never called overdue.
 */

import { NIGHT_ROLLOVER_HOUR, STATION_TIMEZONE } from "@/lib/constants";

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
  } else if (hours > NIGHT_ROLLOVER_HOUR && hours < 12) {
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
