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
 * Exported as well as summed, because the cards carry the figure now and the
 * one on the card has to be the same arithmetic as the one in the total. A
 * driver's row saying 3 while the night says 7 across three drivers is the
 * kind of disagreement nobody can resolve standing in a yard.
 *
 * `returnsCount` is the leading `2R` the dispatcher types and is what this is
 * normally reading. When there is no total in front — "1 RNI 1 Can't find
 * address", typed fast mid-wave — the reasons are added up instead, which is
 * the same arithmetic their own screen shows them under the field.
 *
 * A line with words and no figures at all counts as nothing. Returns are a
 * quantity of parcels, and there is no honest number to take from prose.
 */
export function returnsOn(entry: Entry): number {
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
export function infractionsOn(entry: Entry): number {
  const counted = countInfractions(entry.infractions);
  if (counted !== null) return counted;
  return entry.infractions.trim() === "" ? 0 : 1;
}

/** One driver on the infractions list, and how many he picked up. */
export type InfractionLine = {
  driverId: string;
  fullName: string;
  count: number;
};

/**
 * Who the night's infractions actually belong to.
 *
 * The figure at the top of Karim's phone answers "how many" and is the number
 * somebody asks for at End Day. This answers the question straight after it,
 * which is the one he cannot get off a total: which of them, and who has more
 * than one. Until now the only way was to read forty rows.
 *
 * Summed by driver rather than by row. A second trip is a second row under one
 * name, and a man does not have two separate infractions because he went back
 * out — the list has to read the way Karim would say it out loud.
 *
 * Worst first, because that is the order the conversation happens in. Ties go
 * alphabetically so the list does not reshuffle itself under his thumb every
 * time a snapshot lands.
 */
export function infractionsByDriver(entries: Entry[]): InfractionLine[] {
  const lines = new Map<string, InfractionLine>();

  for (const entry of entries) {
    const count = infractionsOn(entry);
    if (count === 0) continue;

    // Keyed by driver where there is one, and by row otherwise — an entry with
    // no driverId behind it is still somebody, and dropping it would make the
    // list disagree with the total above it.
    const key = entry.driverId || `entry:${entry.id}`;
    const line = lines.get(key);

    if (line) line.count += count;
    else
      lines.set(key, {
        driverId: entry.driverId,
        fullName: entry.fullName,
        count,
      });
  }

  return [...lines.values()].sort(
    (a, b) => b.count - a.count || a.fullName.localeCompare(b.fullName),
  );
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
