/**
 * The sentence a dry van writes into the van issues box.
 *
 * Fuel and nothing else. It is the one check whose answer is somebody else's
 * problem tomorrow morning — the van issues column is what gets read off the
 * sheet, and a van that came back empty has to be in it. A missing snack or
 * charger is a handover detail that already has its own box on the sheet, and
 * repeating it in prose would only make the column longer and less read.
 */
const FUEL_NOTE = "No fuel";

/**
 * Sentences this file has written at one time or another.
 *
 * Only the first is ever written now. The rest are here so a note left behind
 * by the version that wrote all six takes itself off the next time Karim
 * touches that driver, rather than sitting there as text nobody typed and
 * nobody can explain.
 */
const KNOWN_NOTES = [
  FUEL_NOTE,
  "No key",
  "No charger",
  "No mobile",
  "No snack",
  "No lights",
];

/**
 * Van issues, with the fuel note in front of whatever Karim typed.
 *
 * Cross the fuel and "No fuel" appears; put it back to a tick, or back to
 * unchecked, and it goes. He should not have to type it one-handed in the dark
 * when the box he just crossed already says it.
 *
 * Everything he typed himself survives untouched. That is what stripNotes is
 * careful about, and it is the whole reason this is a tested function rather
 * than three lines in a click handler.
 */
export function withFuelNote(current: string, fuel: boolean | null): string {
  const manual = stripNotes(current);
  if (fuel !== false) return manual;
  return [FUEL_NOTE, manual].filter((part) => part !== "").join(". ");
}

/**
 * Take our own sentence back off the front, and nothing else.
 *
 * Only from the front, and only when the phrase ends where a phrase should —
 * at a separator or at the end of the text. "No fuel card in the holder" is
 * something Karim typed about a fuel card, not something this file wrote, and
 * the naive version of this turned it into "card in the holder".
 *
 * Case-insensitive, so a note he has re-typed in his own capitalisation is
 * still recognised as ours rather than duplicated next to it.
 */
function stripNotes(text: string): string {
  let rest = text.trim();

  for (let removed = true; removed; ) {
    removed = false;

    for (const note of KNOWN_NOTES) {
      if (rest.slice(0, note.length).toLowerCase() !== note.toLowerCase()) {
        continue;
      }

      const after = rest.slice(note.length);
      if (after !== "" && !/^[.,;]/.test(after)) continue;

      rest = after.replace(/^[.,;\s]+/, "");
      removed = true;
      break;
    }
  }

  return rest;
}
