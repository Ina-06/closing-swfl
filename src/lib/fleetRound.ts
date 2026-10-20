/**
 * The rules for when the van and gas-card ticks clear, with nothing else in
 * the way — no Firestore, no React — so they can be tested on their own.
 *
 * A tick records the round it was made in; a van is used while that round is
 * still the current one. Two moments move the round on:
 *
 *   - End Day, always. Karim ending the night makes every van spare.
 *   - The dispatcher starting a new day, but only if End Day did not already
 *     clear the list for it. If it did, anything ticked since — Issam getting
 *     to the vans before the roster was posted — belongs to the new day and
 *     has to survive the roster going up.
 *
 * That second rule is why the marker carries `night` as well as `round`. End
 * Day leaves the round unclaimed (`night: null`); the next day to start claims
 * it and keeps its ticks. A day that finds the round already claimed by an
 * earlier day knows End Day was skipped in between, and starts a fresh one.
 * Looking at the round alone could not tell "End Day ran last night" from
 * "End Day ran three nights ago and nobody has ended a day since".
 */

export type RoundMarker = {
  /** What a tick writes onto a van. Used means `usedOn === round`. */
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
  // End Day cleared the list and nobody has claimed it: keep its ticks.
  if (current && current.night === null) return { ...current, night: nightKey };
  // Never written, or still claimed by an earlier day: End Day was skipped.
  return { round: nightKey, night: nightKey };
}

/** Whether a van or card ticked in `usedOn` counts as used in `round`. */
export function usedInRound(usedOn: string, round: string): boolean {
  return usedOn !== "" && usedOn === round;
}
