import { CHECKS, stationTimeLabel, type CheckField } from "@/lib/constants";
import type { Entry } from "@/lib/types";

/**
 * One line of the paper sheet.
 *
 * Everything is already a string by the time it leaves here, so the PDF is
 * only ever laying out text it was handed. Deciding what a blank cell means is
 * this file's job and nowhere else's — a renderer that also decides is a
 * renderer nobody can check.
 */
export type SheetRow = {
  number: string;
  name: string;
  time: string;
  van: string;
  /** Keyed off CHECKS, so the sheet cannot fall out of order with the phone. */
  checks: Record<CheckField, Mark>;
  vanIssues: string;
};

export type Mark = "yes" | "no" | "";

/**
 * Only a real `true` or `false` puts a glyph in the box.
 *
 * Written the strict way round because this is fed straight from Firestore on
 * the server, without the client's defaulting. A night recorded before a check
 * existed has no field for it at all, and the loose test would have printed a
 * red cross against every one of them — the sheet claiming something was
 * missing that nobody was ever asked to look for.
 */
function mark(value: boolean | null): Mark {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

/**
 * The clock-out, in the station's timezone whatever machine builds this.
 *
 * A stamped time and a time relayed over the phone both end up here as the
 * same column, because on paper they always were. The distinction lives on the
 * two screens, where someone can still act on it.
 */
function timeLabel(entry: Entry): string {
  if (entry.clockOut) return stationTimeLabel(entry.clockOut.toDate());
  return entry.clockOutManual.trim();
}

export function sheetRows(entries: Entry[]): SheetRow[] {
  return entries.map((entry, index) => {
    const checks = {} as Record<CheckField, Mark>;
    for (const check of CHECKS) checks[check.field] = mark(entry[check.field]);

    return {
      // Position, not the stored seq — the same numbering the dispatcher's
      // table shows, so a row removed mid-night leaves no hole on the sheet.
      number: String(index + 1),
      /**
       * Marked, because on paper the same name twice is the shape a duplicated
       * row makes. It is not one: he went back out and came in again, and the
       * two lines carry two vans and two times. Whoever reads this in the
       * morning has to be able to tell those apart at a glance.
       */
      name: entry.secondTrip ? `${entry.fullName} (2nd)` : entry.fullName,
      time: timeLabel(entry),
      van: entry.van.trim(),
      checks,
      vanIssues: entry.vanIssues.trim(),
    };
  });
}
