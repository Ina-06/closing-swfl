import { parseReturns } from "@/lib/returns";
import type { Entry } from "@/lib/types";

/**
 * The returns spreadsheet, decided here rather than in the route.
 *
 * The dispatcher's screen needs the same answer before the file exists — it
 * says how many drivers will be in it — and one function means the count they
 * are shown and the rows they get can never disagree.
 */
export type ReturnsRow = {
  name: string;
  count: number;
  reason: string;
};

/**
 * Only drivers who actually brought something back.
 *
 * A driver with `0R` is not in the file at all: the whole point of it is the
 * list someone works through in the morning, and thirty rows of zero is how
 * that list stops being read.
 */
export function returnsRows(entries: Entry[]): ReturnsRow[] {
  const rows: ReturnsRow[] = [];

  for (const entry of entries) {
    const parsed = parseReturns(entry.returnsRaw);
    const summed = parsed.reasons.reduce(
      (running, reason) => running + reason.count,
      0,
    );

    // The typed total wins; a line with reasons but no `2R` in front still
    // counts, because the packages came back either way.
    const count = parsed.count ?? summed;
    if (count <= 0 && parsed.reasons.length === 0) continue;

    rows.push({
      name: entry.fullName,
      count,
      reason: reasonText(parsed.reasons, entry.returnsRaw, parsed.count),
    });
  }

  return rows;
}

/**
 * Drivers whose returns line has words in it but no number anywhere.
 *
 * These are the only rows the filter above can get wrong. "0R" and an empty
 * field mean nothing came back and are safely left out; something like
 * "brought a few back" also falls out, and that one might have been a real
 * return. Rather than guess, the dispatcher gets told before the file is built.
 */
export function unreadableReturns(entries: Entry[]): string[] {
  return entries
    .filter((entry) => {
      if (!entry.returnsRaw.trim()) return false;
      const parsed = parseReturns(entry.returnsRaw);
      return parsed.count === null && parsed.reasons.length === 0;
    })
    .map((entry) => entry.fullName);
}

/**
 * Reasons in the order they were typed.
 *
 * When the line did not parse at all, the whole raw string goes in instead —
 * never lose typed text applies to the spreadsheet as much as to the screen,
 * and a reason we could not read is still a reason someone can read.
 */
function reasonText(
  reasons: { count: number; text: string }[],
  raw: string,
  total: number | null,
): string {
  if (reasons.length > 0) {
    return reasons.map((reason) => `${reason.count} ${reason.text}`).join(", ");
  }
  // A bare "2R" has nothing to say here; repeating it would just be the count
  // again in the next column.
  return total === null ? raw.trim() : "";
}
