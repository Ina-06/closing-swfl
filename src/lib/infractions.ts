import { parseReasons } from "@/lib/returns";

/**
 * How many infractions a driver picked up tonight.
 *
 * The dispatcher types this the same way they type returns — the number in
 * front of the thing, "1 speeding", or "1 speeding 2 distraction" when it was
 * that kind of night. So it is read by the same parser; a station has one habit
 * here, and two pieces of code reading it two ways is how they drift apart.
 *
 * Null rather than zero when there is text but no number in it. "Spoke to him
 * about his scan rate" is an infraction that happened, and a bare warning
 * triangle is the honest way to show it — inventing a 1 would be putting a
 * figure on the sheet that nobody wrote.
 */
export function countInfractions(raw: string): number | null {
  if (!raw.trim()) return null;

  const total = parseReasons(raw).reduce(
    (running, reason) => running + reason.count,
    0,
  );

  return total > 0 ? total : null;
}
