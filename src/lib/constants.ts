/**
 * Station-wide constants.
 *
 * The timezone here is the single source of truth for every rendered time in
 * the app. We never read the device timezone — Karim's phone, my laptop, the
 * Vercel server and the PDF must all agree on what "9:45" means.
 */
export const APP_NAME = "Closing";
export const STATION_CODE = "SWFL";
export const STATION_TIMEZONE = "America/New_York";

/**
 * Metric options, in order from best to worst finish.
 *
 * The stored value is the compact code; the label is what the station says out
 * loud and is what appears in the UI and on the PDF. Codes already written to
 * past sheets (OI, A, JA, JB, B, WB) are all still in this list, so widening
 * the scale did not orphan a single entry.
 *
 * `tone` is here rather than in a component so the scale and how it reads are
 * defined in one place. On it and everything above it is fine and shows green;
 * below that it darkens a step at a time to the bottom.
 */
export const METRICS = [
  { value: "FA", label: "F.A.", title: "Far above", tone: "good" },
  { value: "WA", label: "W.A.", title: "Well above", tone: "good" },
  { value: "A", label: "A", title: "Above", tone: "good" },
  { value: "JA", label: "J.A.", title: "Just above", tone: "good" },
  { value: "OI", label: "O.I.", title: "On it", tone: "good" },
  { value: "JB", label: "J.B.", title: "Just below", tone: "warn" },
  { value: "B", label: "B", title: "Below", tone: "caution" },
  { value: "WB", label: "W.B.", title: "Well below", tone: "bad" },
  { value: "FB", label: "F.B.", title: "Far below", tone: "critical" },
] as const;

export type Metric = (typeof METRICS)[number]["value"];
export type MetricTone = (typeof METRICS)[number]["tone"];

/**
 * The handover checks, in the order Karim walks them at the van.
 *
 * Defined once, here, because three different things render this list — his
 * phone, the dispatcher's table and the PDF — and an order that drifts between
 * them is an order nobody can trust.
 *
 * Three names each, for three widths, and the difference between them is the
 * job each one is doing. `label` is what Karim reads standing at the van, so it
 * names everything he is holding: the charger comes back with the sharpie, the
 * mobile comes back switched off. `short` is the same check the next morning,
 * as a column heading on the PDF a few characters wide, where the reminder has
 * already done its work and only the thing needs naming. `letter` is the
 * dispatcher's table, for a check nobody has made yet.
 */
export const CHECKS = [
  { field: "fuel", label: "Fuel", short: "Fuel", letter: "F" },
  { field: "key", label: "Key", short: "Key", letter: "K" },
  { field: "charger", label: "Charger + Sharpie", short: "Charger", letter: "C" },
  { field: "mobile", label: "Mobile + Off", short: "Mobile", letter: "M" },
  { field: "snack", label: "Snack", short: "Snack", letter: "S" },
  { field: "lights", label: "Lights", short: "Lights", letter: "L" },
  { field: "bungees", label: "2 Bungees", short: "Bungees", letter: "B" },
] as const;

export type CheckField = (typeof CHECKS)[number]["field"];

/** Roles a session can be signed in under. */
export const ROLES = ["dispatcher", "closer", "onetime"] as const;
export type Role = (typeof ROLES)[number];

/** Today's date in the station timezone, as the `YYYY-MM-DD` session id. */
export function stationDateKey(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the session document id.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STATION_TIMEZONE,
  }).format(at);
}

/**
 * Before this hour, we are still on the previous night's sheet.
 *
 * The close runs late. When Karim stamps the last van in at 00:40, that driver
 * belongs to the night that started the evening before — not to a brand new,
 * empty session. Every session id goes through stationNightKey, never through
 * the raw calendar date.
 */
export const NIGHT_ROLLOVER_HOUR = 4;

/** The session id for the night a given moment belongs to. */
export function stationNightKey(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  // Build the date in UTC purely as a calendar, so subtracting a day cannot
  // trip over a daylight saving boundary.
  const calendar = new Date(
    `${part("year")}-${part("month")}-${part("day")}T00:00:00Z`,
  );
  if (Number(part("hour")) < NIGHT_ROLLOVER_HOUR) {
    calendar.setUTCDate(calendar.getUTCDate() - 1);
  }
  return calendar.toISOString().slice(0, 10);
}

/**
 * A stamped clock-out, rendered in the station timezone.
 *
 * Never the device timezone: the phone that stamped it, the laptop reading it
 * and the PDF must all print the same time.
 */
export function stationTimeLabel(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

/** A stamped clock-out as a 24-hour `HH:mm`, for `<input type="time">`. */
export function stationTimeInputValue(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STATION_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "00";

  return `${part("hour")}:${part("minute")}`;
}

/**
 * How far the station is from UTC at a given instant.
 *
 * Read from the formatter rather than hard-coded, so the two nights a year
 * when the clocks move are not special cases.
 */
function stationOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? "0");

  const asIfUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );

  // Compare against the same instant floored to the minute, so the seconds
  // the formatter dropped do not leak into the offset.
  const flooredAt = Math.floor(at.getTime() / 60_000) * 60_000;
  return Math.round((asIfUtc - flooredAt) / 60_000);
}

/**
 * The real instant behind a wall-clock time typed on a given night.
 *
 * Karim corrects a clock-out by typing `00:14`, and that has to land fourteen
 * minutes after midnight on the night that *started* the evening before — the
 * same rollover stationNightKey uses. Resolved twice because the offset
 * depends on the instant and the instant depends on the offset.
 */
export function stationInstant(
  nightKey: string,
  hours: number,
  minutes: number,
): Date {
  const calendar = new Date(`${nightKey}T00:00:00Z`);
  if (hours < NIGHT_ROLLOVER_HOUR) {
    calendar.setUTCDate(calendar.getUTCDate() + 1);
  }

  const wall = Date.UTC(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth(),
    calendar.getUTCDate(),
    hours,
    minutes,
  );

  const guess = new Date(wall - stationOffsetMinutes(new Date(wall)) * 60_000);
  return new Date(wall - stationOffsetMinutes(guess) * 60_000);
}

/** Long-form date for headers and the PDF, e.g. "Wed 12 Aug 2026". */
export function stationDateLabel(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: STATION_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(at);
}
