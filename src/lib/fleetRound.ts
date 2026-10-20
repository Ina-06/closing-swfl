/**
 * The rules for when the list of available vans and gas cards empties, with
 * nothing else in the way — no Firestore, no React — so they can be tested on
 * their own.
 *
 * Each line records the round it was written in, and the list shows only the
 * current round's lines. Two moments move the round on:
 *
 *   - End Day, always. Karim ending the night empties the list.
 *   - The dispatcher starting a new day, but only if End Day did not already
 *     empty the list for it. If it did, anything written since — Issam typing
 *     up the spares before the roster was posted — belongs to the new day and
 *     has to survive the roster going up.
 *
 * That second rule is why the marker carries `night` as well as `round`. End
 * Day leaves the round unclaimed (`night: null`); the next day to start claims
 * it and keeps its lines. A day that finds the round already claimed by an
 * earlier day knows End Day was skipped in between, and starts a fresh one.
 * Looking at the round alone could not tell "End Day ran last night" from
 * "End Day ran three nights ago and nobody has ended a day since".
 */

export type RoundMarker = {
  /** What a new line is stamped with. The list shows lines of this round. */
  round: string;
  /** The day that has claimed this round, or null straight after End Day. */
  night: string | null;
};

/** The round before any session has ever moved it. */
export const FIRST_ROUND = "first";

/** The marker End Day writes: a fresh round, claimed by nobody yet. */
export function closedMarker(nightKey: string): RoundMarker {
  return { round: `${nightKey}:closed`, night: null };
}

/**
 * The marker a new day writes, or null to leave it as it is.
 *
 * `current` is undefined if the marker has never been written.
 */
export function markerOnStart(
  current: RoundMarker | undefined,
  nightKey: string,
): RoundMarker | null {
  // Already this day's — the roster was posted twice, or reopened.
  if (current?.night === nightKey) return null;
  // End Day emptied the list and nobody has claimed it: keep its lines.
  if (current && current.night === null) return { ...current, night: nightKey };
  // Never written, or still claimed by an earlier day: End Day was skipped.
  return { round: nightKey, night: nightKey };
}
