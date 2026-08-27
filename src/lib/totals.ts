import { countInfractions } from "@/lib/infractions";
import type { Entry } from "@/lib/types";

/**
 * The two numbers that describe the night rather than a driver.
 *
 * Both screens carry them, and they have to agree. A dispatcher reading "7
 * returns" off a laptop and Karim reading "6" off a phone is worse than
 * neither of them having the figure at all, so it is counted once, here, and
 * both sides render the same object.
 */
export type NightTotals = {
  /** Packages that came back. */
  returns: number;
  /** Things drivers picked up tonight, not drivers who picked something up. */
  infractions: number;
};

/**
 * Returns for one driver.
 *
 * `returnsCount` is the leading `2R` the dispatcher types and is what this is
 * normally reading. When there is no total in front — "1 RNI 1 Can't find
 * address", typed fast mid-wave — the reasons are added up instead, which is
 * the same arithmetic their own screen shows them under the field.
 *
 * A line with words and no figures at all counts as nothing. Returns are a
 * quantity of parcels, and there is no honest number to take from prose.
 */
function returnsOn(entry: Entry): number {
  if (entry.returnsCount !== null) return entry.returnsCount;
  return entry.returnsReasons.reduce(
    (running, reason) => running + reason.count,
    0,
  );
}

/**
 * Infractions for one driver.
 *
 * The parser first, same as everywhere else — "1 speeding 2 distraction" is
 * three. Where it comes back with nothing but there is text in the field, that
 * counts as one, and this is the one place in the app that does that.
 *
 * It is deliberate rather than sloppy. Per driver the app refuses to invent a
 * figure, because a bare "1" printed beside "Spoke to him about his scan rate"
 * reads as a number somebody wrote down. In a total it is the opposite way
 * round: an infraction is an event, the field is never filled in for nothing,
 * and a night counter saying zero while a driver has an infraction against him
 * is the count being wrong rather than cautious.
 */
function infractionsOn(entry: Entry): number {
  const counted = countInfractions(entry.infractions);
  if (counted !== null) return counted;
  return entry.infractions.trim() === "" ? 0 : 1;
}

export function nightTotals(entries: Entry[]): NightTotals {
  return entries.reduce<NightTotals>(
    (running, entry) => ({
      returns: running.returns + returnsOn(entry),
      infractions: running.infractions + infractionsOn(entry),
    }),
    { returns: 0, infractions: 0 },
  );
}
