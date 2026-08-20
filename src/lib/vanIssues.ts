/**
 * The sentences the van issues box writes for itself.
 *
 * Two controls put text in that box, and both are things somebody has to act on
 * in the morning rather than facts about tonight. The van issues column is what
 * gets read off the sheet, so a van that came back empty and a van that is off
 * the road have to be in it. A missing snack or charger is a handover detail
 * that already has its own box, and repeating it in prose would only make the
 * column longer and less read.
 */
const GROUNDED_NOTE = "🚨Grounded";
const FUEL_NOTE = "No fuel";

/**
 * Sentences this file has written at one time or another.
 *
 * Only the first two are ever written now. The rest are here so a note left
 * behind by the version that wrote all six checks takes itself off the next
 * time Karim touches that driver, rather than sitting there as text nobody
 * typed and nobody can explain.
 *
 * Grounded leads, and that is the order it is written in too: it is the one
 * that stops the van going out tomorrow.
 */
const KNOWN_NOTES = [
  GROUNDED_NOTE,
  FUEL_NOTE,
  "No key",
  "No charger",
  "No mobile",
  "No snack",
  "No lights",
];

/** What the two self-writing controls are set to. */
export type VanFlags = {
  /** Crossed fuel writes a note; ticked or unchecked does not. */
  fuel: boolean | null;
  grounded: boolean;
};

/**
 * Van issues, with our own sentences in front of whatever Karim typed.
 *
 * Ground the van and "🚨Grounded" appears; cross the fuel and "No fuel"
 * appears. Undo either and it goes. He should not have to type them one-handed
 * in the dark when the control he just used already says it.
 *
 * Everything he typed himself survives untouched. That is what stripNotes is
 * careful about, and it is the whole reason this is a tested function rather
 * than three lines in a click handler.
 */
export function withNotes(current: string, flags: VanFlags): string {
  const manual = stripNotes(current);

  return [
    flags.grounded ? GROUNDED_NOTE : "",
    flags.fuel === false ? FUEL_NOTE : "",
    manual,
  ]
    .filter((part) => part !== "")
    .join(". ");
}

/**
 * Take our own sentences off the front, and nothing else.
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
