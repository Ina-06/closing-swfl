import { stationTimeLabel } from "@/lib/constants";
import { parseReturns } from "@/lib/returns";
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
  /** "yes", "no", or "" for a check nobody made. */
  cell: Mark;
  key: Mark;
  fuel: Mark;
  infractions: string;
  returns: string;
  rescues: string;
  vanIssues: string;
};

export type Mark = "yes" | "no" | "";

function mark(value: boolean | null): Mark {
  if (value === null) return "";
  return value ? "yes" : "no";
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
    const parsed = parseReturns(entry.returnsRaw);
    const summed = parsed.reasons.reduce(
      (running, reason) => running + reason.count,
      0,
    );
    const returns = parsed.count ?? (parsed.reasons.length ? summed : null);

    return {
      // Position, not the stored seq — the same numbering the dispatcher's
      // table shows, so a row removed mid-night leaves no hole on the sheet.
      number: String(index + 1),
      name: entry.fullName,
      time: timeLabel(entry),
      van: entry.van.trim(),
      cell: mark(entry.cell),
      key: mark(entry.key),
      fuel: mark(entry.fuel),
      infractions: entry.infractions.trim(),
      // Just the number. The reasons are the spreadsheet's job; this column is
      // two characters wide on the paper sheet and always has been.
      returns: returns === null ? "" : String(returns),
      // Signed, and blank at zero: a column of noughts is a column nobody
      // reads, and the ones that matter should stand out of an empty column.
      rescues: entry.rescues === 0 ? "" : formatSigned(entry.rescues),
      vanIssues: entry.vanIssues.trim(),
    };
  });
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
