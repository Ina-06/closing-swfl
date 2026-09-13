import type { Entry, RosterEntry, Session } from "@/lib/types";

/**
 * What HR changed about a driver's hours tonight.
 *
 * A third party to the close. The dispatcher has what the driver said on the
 * phone, Karim has what happened in the yard, and HR has the hours — which
 * neither of the other two owns and neither of them should be able to edit. So
 * it is its own field, written by one role, and read by both the others.
 *
 * It is looked up by driverId everywhere, never by entry id. That is not an
 * implementation detail, it is what the thing *is*: an edit to a person's hours
 * for the night. He may have two rows on the sheet because he went back out, or
 * no row at all because nobody has heard from him yet, and in both cases there
 * is exactly one answer to what HR did to his timecard.
 */

/** HR's edit for this driver, or "" if there is none. */
export function timeEditFor(session: Session, driverId: string): string {
  return session.timeEdits[driverId] ?? "";
}

/**
 * Everyone HR could write an edit against tonight, in one alphabet.
 *
 * The roster is the list HR came here for — it is what dispatch posted and what
 * the hours are being reconciled against. Drivers who only exist as entries are
 * on it too: a van that turned up unannounced was still on the clock, and HR
 * having to wait for tomorrow's roster to correct tonight's hours would be the
 * one case the portal cannot handle.
 *
 * Keyed by driverId and deduplicated by it, so a second trip is one name on
 * this list and not two — the same reason the edits themselves are keyed that
 * way. Shaped here rather than in the component because the HR screen and the
 * dispatcher's read-out both have to agree on who is on tonight.
 */
export type TimeEditTarget = {
  driverId: string;
  fullName: string;
  /** Present when the name came off tonight's roster, for the flags. */
  roster?: RosterEntry;
  /** Whatever HR has already written, or "". */
  edit: string;
  /** Nobody on the roster has phoned in, and he has no row. */
  entered: boolean;
};

export function timeEditTargets(
  session: Session,
  entries: Entry[],
): TimeEditTarget[] {
  const rosterByDriver = new Map(
    session.roster.map((row) => [row.driverId, row]),
  );

  const byDriver = new Map<string, TimeEditTarget>();

  for (const row of session.roster) {
    byDriver.set(row.driverId, {
      driverId: row.driverId,
      fullName: row.fullName,
      roster: row,
      edit: timeEditFor(session, row.driverId),
      entered: false,
    });
  }

  for (const entry of entries) {
    // The entry's name wins over the roster's. It is the one that was copied
    // onto the sheet, so it is the one HR is reading everywhere else.
    byDriver.set(entry.driverId, {
      driverId: entry.driverId,
      fullName: entry.fullName,
      roster: rosterByDriver.get(entry.driverId),
      edit: timeEditFor(session, entry.driverId),
      entered: true,
    });
  }

  return [...byDriver.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName),
  );
}
