/**
 * The sentences the van issues box writes for itself.
 *
 * Three controls put text in that box, and all three are things somebody has to
 * act on in the morning rather than facts about tonight. The van issues column
 * is what gets read off the sheet, so a van that came back empty, a van that
 * came back without its key, and a van that is off the road all have to be in
 * it. A missing snack or charger is a handover detail that already has its own
 * box, and repeating it in prose would only make the column longer and less
 * read.
 *
 * The key is in that set for the same reason the fuel is: the van cannot go out
 * in the morning without it, and the person who finds that out should not be
 * the driver stood in the yard at ten past six. Every other check on the tile
 * grid is something that can be replaced out of a drawer before the wave.
 */
/**
 * Shouted in capitals rather than with a siren.
 *
 * It used to be "🚨Grounded". The emoji was there to make the one line on the
 * sheet that stops a van going out tomorrow impossible to skim past, and on the
 * phone it did exactly that — but the PDF is laid out in Helvetica, and the
 * standard PDF fonts have no emoji in them at all. What came off the printer
 * was a blank where the siren should have been, on the single most important
 * cell of the night. Capitals carry the same weight and survive the trip.
 */
const GROUNDED_NOTE = "GROUNDED";
const FUEL_NOTE = "No fuel";
const KEY_NOTE = "No key";

/**
 * Sentences this file has written at one time or another.
 *
 * Only the first three are ever written now. The rest are here so a note left
 * behind by an older version takes itself off the next time Karim touches that
 * driver, rather than sitting there as text nobody typed and nobody can
 * explain. That includes the siren: a van grounded last week still reads
 * "🚨Grounded", and the moment anyone touches it, it becomes the new wording
 * instead of ending up written twice.
 *
 * Grounded leads, and that is the order it is written in too: it is the one
 * that stops the van going out tomorrow.
 */
const KNOWN_NOTES = [
  GROUNDED_NOTE,
  "🚨Grounded",
  FUEL_NOTE,
  KEY_NOTE,
  "No charger",
  "No mobile",
  "No snack",
  "No lights",
];

/** What the three self-writing controls are set to. */
export type VanFlags = {
  /** Crossed fuel writes a note; ticked or unchecked does not. */
  fuel: boolean | null;
  /** Same again for the key, and for the same reason — see the note above. */
  key: boolean | null;
  grounded: boolean;
};

/**
 * Van issues, with our own sentences in front of whatever Karim typed.
 *
 * Ground the van and "GROUNDED" appears; cross the fuel and "No fuel" appears;
 * cross the key and "No key" appears. Undo any of them and it goes. He should
 * not have to type them one-handed in the dark when the control he just used
 * already says it.
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
    flags.key === false ? KEY_NOTE : "",
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
