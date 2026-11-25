import { CHECKS, stationTimeLabel, type CheckField } from "@/lib/constants";
import type { Entry, RosterEntry } from "@/lib/types";

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
  /** Signed packages, "+23" or "-11", or "" for none. */
  rescues: string;
  /** Which way the rescue went, so the renderer colours it without deciding. */
  rescueSign: "plus" | "minus" | "";
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
 * Characters the PDF's fonts do not have, and the space they leave behind.
 *
 * The sheet is set in Helvetica, and the standard PDF fonts stop at Latin-1 —
 * there is no emoji in any of them. A siren or a thumbs-up typed into the van
 * issues box does not come out small or ugly, it comes out as nothing at all,
 * silently, in the one column somebody reads in the morning. So they are taken
 * out here, where it can be tested, rather than being discovered on paper.
 *
 * Deliberately narrow. It is the emoji planes and the symbol block they get
 * picked from, plus the invisible selectors and joiners that hang off them —
 * not "anything unusual". Accents, curly quotes and dashes are all in the
 * fonts and all things the closer actually types, and losing an accent off a name
 * would be a worse bug than the one this fixes.
 */
const NOT_IN_THE_FONT =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

/** Whatever was typed, in characters the sheet can actually print. */
export function printable(text: string): string {
  return text.replace(NOT_IN_THE_FONT, "").replace(/\s+/g, " ").trim();
}

/**
 * The clock-out, in the station's timezone whatever machine builds this.
 *
 * A stamped time and a time relayed over the phone both end up here as the
 * same column, because on paper they always were. The distinction lives on the
 * two screens, where someone can still act on it.
 */
function timeLabel(entry: Entry, closed: boolean): string {
  if (entry.clockOut) return stationTimeLabel(entry.clockOut.toDate());
  const typed =
    typeof entry.clockOutManual === "string" ? entry.clockOutManual.trim() : "";
  if (typed !== "") return typed;
  return closed ? NOT_AVAILABLE : "";
}

/**
 * What a time cell says when the night is over and there is still no time.
 *
 * Only ever printed, never stored. A blank cell on an open night means "not
 * back yet", which is true and is what the sheet has always said; the same
 * blank on a closed night reads as somebody forgetting to fill it in, when what
 * actually happened is that no time was ever recorded. Writing "N/A" into
 * Firestore would be the app inventing a value, and a time corrected the next
 * morning would then have to fight it — so it lives here, in the rendering, and
 * Rebuild picks up the real time the moment anybody enters one.
 */
export const NOT_AVAILABLE = "N/A";

/** Every check blank — the row exists, but nobody stood at a van for it. */
function blankChecks(): Record<CheckField, Mark> {
  const checks = {} as Record<CheckField, Mark>;
  for (const check of CHECKS) checks[check.field] = "";
  return checks;
}

/** Who the sheet is for, beyond the entries themselves. */
export type SheetContext = {
  /** The night is closed: missing times print N/A, and nobody is left off. */
  closed?: boolean;
  /**
   * Tonight's roster, for the drivers dispatch never entered.
   *
   * Read only when the night is closed. While it is open they are simply not
   * in yet — they are on the still-to-call-in list on both screens, which is
   * where somebody can act on it — and putting them on the sheet early would
   * make a half-finished night look like a finished one.
   */
  roster?: RosterEntry[];
};

/**
 * Rescues as the paper reads them: the sign kept, because "23" and "-23" are
 * the same glyphs minus the one that matters, and nothing at all for none.
 *
 * Checked for a real number because this is fed raw from Firestore on the
 * server, and a night written before rescues existed has no field at all —
 * that is a blank cell, not a "+NaN".
 */
function rescueCell(raw: unknown): Pick<SheetRow, "rescues" | "rescueSign"> {
  const count = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  if (count > 0) return { rescues: `+${count}`, rescueSign: "plus" };
  if (count < 0) return { rescues: `-${Math.abs(count)}`, rescueSign: "minus" };
  return { rescues: "", rescueSign: "" };
}

/**
 * The night as rows on the sheet.
 *
 * On a closed night two things change, and both are about the same fact: the
 * night ended with people unaccounted for. A driver with a row but no time gets
 * N/A in the time cell. A driver on the roster who never got a row at all —
 * dispatch never heard from him — gets a row of his own at the bottom, marked
 * "(not entered)", built from the roster alone. No entry is created for him;
 * the entries are still the record, and this is only the sheet admitting who
 * is missing from it rather than quietly printing a shorter list.
 */
export function sheetRows(
  entries: Entry[],
  { closed = false, roster = [] }: SheetContext = {},
): SheetRow[] {
  const rows = entries.map((entry, index) => {
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
      name: printable(
        entry.secondTrip ? `${entry.fullName} (2nd)` : entry.fullName,
      ),
      time: timeLabel(entry, closed),
      ...rescueCell(entry.rescues),
      van: typeof entry.van === "string" ? entry.van.trim() : "",
      checks,
      vanIssues: printable(
        typeof entry.vanIssues === "string" ? entry.vanIssues : "",
      ),
    };
  });

  if (!closed) return rows;

  // Matched on driverId, so a driver with two rows (a second trip) is not
  // added a third time, and a roster line with no id cannot match anything.
  const entered = new Set(entries.map((entry) => entry.driverId));
  for (const driver of roster) {
    if (driver.driverId === "" || entered.has(driver.driverId)) continue;
    entered.add(driver.driverId);
    rows.push({
      number: String(rows.length + 1),
      name: printable(`${driver.fullName} (not entered)`),
      time: NOT_AVAILABLE,
      rescues: "",
      rescueSign: "",
      van: "",
      checks: blankChecks(),
      vanIssues: "",
    });
  }

  return rows;
}
