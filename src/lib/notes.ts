import type { Session } from "@/lib/types";

/**
 * The one note a driver has, and where it comes from before he has a row.
 *
 * There is deliberately only ever one. It is the amber strip on his card and
 * the line at the top of his sheet, and it reads the same whoever wrote it —
 * Karim in the yard or the dispatcher on the phone. Two note fields would mean
 * two strips to read and a card that could show one while hiding the other.
 *
 * The wrinkle is that half of what Karim wants to write down is about a driver
 * nobody has heard from yet, who therefore has no row to write it on. Those
 * notes wait on the session, keyed by driverId, and move onto the row the
 * moment one exists. This file is both halves of that: where to read a pending
 * note, and how it joins whatever else is being written at the same time.
 */

/** Karim's note about a driver who has no row yet, or "" if there is none. */
export function pendingNote(session: Session, driverId: string): string {
  return session.rosterNotes[driverId] ?? "";
}

/**
 * A driver's note when his row is created, from the places one can come.
 *
 * Karim's, written against his name on the roster before anybody had heard from
 * him, and whatever the dispatcher typed into the form at the same moment. Both
 * are kept, in that order: Karim's is older, and it is the one nobody else knows
 * about. Joining beats picking, because either one dropped is a note somebody
 * wrote on purpose and then never saw again.
 *
 * Here rather than in a component because all four places that create a row
 * have to answer this the same way — the dispatcher's form, Add a driver, a tap
 * on a dashed card, and a second trip.
 */
export function joinNotes(...parts: (string | undefined)[]): string {
  const kept: string[] = [];

  for (const part of parts) {
    const text = (part ?? "").trim();
    // The same words twice is one note, not two. It happens when the dispatcher
    // reads Karim's off their screen and types it into the form as well.
    const already = kept.some(
      (seen) => seen.toLowerCase() === text.toLowerCase(),
    );
    if (text !== "" && !already) kept.push(text);
  }

  return kept.join(". ");
}
