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
 */
export const METRICS = [
  { value: "FA", label: "F.A.", title: "Far above" },
  { value: "WA", label: "W.A.", title: "Well above" },
  { value: "A", label: "A", title: "Above" },
  { value: "JA", label: "J.A.", title: "Just above" },
  { value: "OI", label: "O.I.", title: "On it" },
  { value: "JB", label: "J.B.", title: "Just below" },
  { value: "B", label: "B", title: "Below" },
  { value: "WB", label: "W.B.", title: "Well below" },
  { value: "FB", label: "F.B.", title: "Far below" },
] as const;

export type Metric = (typeof METRICS)[number]["value"];

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
