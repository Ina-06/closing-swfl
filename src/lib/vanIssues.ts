import { CHECKS, type CheckField } from "@/lib/constants";
import type { Entry, EntryChecks } from "@/lib/types";

/**
 * A missing item, said the way Karim would say it.
 *
 * Lowercase because they are joined into one sentence and only the first is
 * capitalised — "No fuel, no charger" is a sentence, "No fuel, No charger" is
 * two labels with a comma between them.
 */
const MISSING_NOTE: Record<CheckField, string> = {
  fuel: "no fuel",
  key: "no key",
  charger: "no charger",
  mobile: "no mobile",
  snack: "no snack",
  lights: "no lights",
};

/** The six checks lifted off an entry, for handing to withMissingNotes. */
export function checksOf(entry: Entry): EntryChecks {
  return {
    fuel: entry.fuel,
    key: entry.key,
    charger: entry.charger,
    mobile: entry.mobile,
    snack: entry.snack,
    lights: entry.lights,
  };
}

/**
 * Van issues, with the missing items written in at the front.
 *
 * Cross the fuel and "No fuel" appears in the box; put it back to a tick, or
 * back to unchecked, and it goes again. The point is that a van that came back
 * dry says so in the one column anybody reads on the sheet, without Karim
 * having to type it while holding a set of keys.
 *
 * The notes are rebuilt from scratch every time rather than nudged, so they
 * always match the boxes and always come in the order the boxes are in,
 * whatever order he tapped them.
 *
 * Everything he typed himself survives untouched. That is what stripNotes is
 * careful about, and it is the whole reason this is a function with tests
 * rather than three lines in a click handler.
 */
export function withMissingNotes(current: string, checks: EntryChecks): string {
  const manual = stripNotes(current);

  const notes = CHECKS.filter((check) => checks[check.field] === false).map(
    (check) => MISSING_NOTE[check.field],
  );

  const auto = notes.join(", ");
  const sentence = auto === "" ? "" : auto[0].toUpperCase() + auto.slice(1);

  return [sentence, manual].filter((part) => part !== "").join(". ");
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

    for (const check of CHECKS) {
      const phrase = MISSING_NOTE[check.field];
      if (rest.slice(0, phrase.length).toLowerCase() !== phrase) continue;

      const after = rest.slice(phrase.length);
      if (after !== "" && !/^[.,;]/.test(after)) continue;

      rest = after.replace(/^[.,;\s]+/, "");
      removed = true;
      break;
    }
  }

  return rest;
}
