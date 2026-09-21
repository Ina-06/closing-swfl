import type { Entry, RepairTask } from "@/lib/types";

/**
 * The repairs board, as rules rather than as screens.
 *
 * Three questions live here, and all three are asked from more than one place:
 * what tonight's sheet puts on the board, which of those are already on it,
 * and where a task belongs once it has been ticked off. Keeping them out of the
 * components means End Day and the board itself cannot come to different
 * answers — which matters most for the second one, since End Day decides what
 * to write and the board is what has to still make sense afterwards.
 */

/**
 * How long a ticked-off task stays on the board before it goes to the archive.
 *
 * A month, because that is what was asked for and because it is roughly how
 * long it takes for "did that van ever get done?" to stop being asked. The
 * archive is not a deletion — nothing here deletes on a clock. It is the same
 * list, one tab over, and a task is only ever moved by time passing.
 */
export const ARCHIVE_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The word "van" in front of a van number, taken off.
 *
 * The field it comes from is free text with a full keyboard on it — van
 * numbers carry letters as often as digits — so "VAN 150", "Van 150" and
 * "#150" all turn up, and all of them mean 150. Left alone, the board renders
 * its own label in front of whatever was typed and says "Van VAN 150".
 *
 * The separator is required, which is the whole point of the rule. A van
 * genuinely called VANGUARD1 must come through untouched, and a prefix test
 * that did not insist on a space or a hash would quietly turn it into GUARD1.
 */
export function cleanVan(van: string): string {
  return van
    .trim()
    .replace(/^(?:van\s*#\s*|van\s+|#\s*)/i, "")
    .trim();
}

/**
 * Two ways of writing the same van.
 *
 * Letters inside the number are kept, so "214B" still tells itself apart from
 * "214". So are leading zeros: "087" and "87" are left as two vans, because
 * the cost of being wrong runs one way. Getting it wrong here suppresses a
 * repair somebody reported — the board would decide it already knew — and a
 * duplicate line that anybody can tick off is a much cheaper mistake than a
 * cracked windscreen nobody hears about again.
 */
function vanKey(van: string): string {
  return cleanVan(van).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Two ways of writing the same fault.
 *
 * Deliberately shallow. Case, accents, spacing and trailing punctuation are
 * noise; every actual word is signal. "Mirror cracked" and "cracked mirror"
 * are left as two different faults, because deciding they are the same means
 * deciding which one the mechanic reads, and this file is not entitled to that.
 */
function faultKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!]+$/, "")
    .trim();
}

/** The key two tasks share when they are the same fault on the same van. */
export function matchKeyFor(van: string, title: string): string {
  return `${vanKey(van)}|${faultKey(title)}`;
}

/** A task before it has a document — what End Day and the composer both build. */
export type NewRepair = {
  title: string;
  van: string;
  grounded: boolean;
  source: RepairTask["source"];
  nightKey: string;
  driverName: string;
  matchKey: string;
};

/**
 * Hand-typed on the board. No night, no driver, no van unless one was given.
 *
 * `grounded` is an argument rather than a constant, and it was a constant
 * once: the composer has an off-the-road switch on it, and a job added by hand
 * for a van nobody dares send out is exactly the job that most needs to be red
 * and at the top. Hard-coding it false threw that switch away silently.
 */
export function manualRepair(
  title: string,
  van: string,
  grounded: boolean,
): NewRepair {
  const cleaned = cleanVan(van);
  return {
    title,
    van: cleaned,
    grounded,
    source: "manual",
    nightKey: "",
    driverName: "",
    matchKey: matchKeyFor(cleaned, title),
  };
}

/**
 * What tonight's sheet puts on the board.
 *
 * One task per van that came back with something wrong with it, and the task
 * is the whole van issues column rather than a sentence out of it. The column
 * is written by three controls and a free-text box joined with full stops —
 * "GROUNDED. No fuel. Nearside mirror is hanging off" — and splitting on those
 * stops would cut the sentence Karim typed in half the moment he used one
 * himself. What the mechanic gets is what is on the sheet.
 *
 * A van with nothing written against it produces nothing. `vanOk` being ticked
 * and `vanOk` never having been looked at are different facts about the night,
 * but neither is a repair, and the board only wants repairs.
 */
export function repairsFromEntries(
  nightKey: string,
  entries: Entry[],
): NewRepair[] {
  const seen = new Set<string>();
  const tasks: NewRepair[] = [];

  for (const entry of entries) {
    const title = entry.vanIssues.trim();
    if (title === "") continue;

    const van = cleanVan(entry.van);
    const matchKey = matchKeyFor(van, title);
    // The same van twice on one night is a second trip, and a fault reported
    // on both trips is still one fault.
    if (seen.has(matchKey)) continue;
    seen.add(matchKey);

    tasks.push({
      title,
      van,
      grounded: entry.grounded,
      source: "endDay",
      nightKey,
      driverName: entry.fullName,
      matchKey,
    });
  }

  return tasks;
}

/**
 * Of tonight's tasks, the ones the board has not already got.
 *
 * Two different things are being kept out, and they are not the same thing.
 *
 * A fault that is still open is not news. The nearside mirror on 214 has been
 * hanging off since Monday, every driver who takes it out says so, and by
 * Friday that is one job to do and five identical lines to tick off. So an
 * open task blocks its own fault outright, for as long as it stays open —
 * which is what was asked for, and is the behaviour that makes the board worth
 * looking at.
 *
 * Ticking it off unblocks it. If the mirror is fixed on Tuesday and hanging
 * off again on Thursday, that is a second job and it should appear as one.
 *
 * The second thing is narrower and is about this app rather than about vans. A
 * night can be reopened by the dispatcher and ended again, and pressing End Day
 * twice must not post the same fault twice — the second press is not a fresh
 * report of anything, it is the same night going past again. So a task also
 * blocks its own fault on its own night, whether or not anyone has ticked it
 * off in between.
 */
export function unseenRepairs(
  candidates: NewRepair[],
  existing: RepairTask[],
): NewRepair[] {
  const open = new Set<string>();
  const posted = new Set<string>();

  for (const task of existing) {
    if (!task.done) open.add(task.matchKey);
    if (task.nightKey !== "") {
      posted.add(`${task.nightKey}::${task.matchKey}`);
    }
  }

  return candidates.filter(
    (candidate) =>
      !open.has(candidate.matchKey) &&
      !posted.has(`${candidate.nightKey}::${candidate.matchKey}`),
  );
}

/** Which of the board's three lists a task is on right now. */
export type Shelf = "todo" | "done" | "archived";

/**
 * Where a task belongs, worked out from the clock rather than stored.
 *
 * Nothing moves a task to the archive. There is no job, no schedule and no
 * field that gets flipped a month later — the task is archived because thirty
 * days have passed, and it says so the moment anybody opens the board. A
 * stored flag would need something to be running at midnight to set it, and
 * the one thing this app has never needed is a server that is awake when
 * nobody is.
 *
 * A ticked task with no stamp on it yet is one that has just been tapped and
 * has not reached the server. It stays on Done, where it was put.
 */
export function shelfFor(task: RepairTask, now: number): Shelf {
  if (!task.done) return "todo";

  const at = task.doneAt?.toMillis();
  if (at === undefined) return "done";

  return now - at >= ARCHIVE_AFTER_DAYS * DAY_MS ? "archived" : "done";
}

/**
 * Days left before a ticked task goes to the archive, or null if it is not
 * ticked or is already there.
 *
 * Rounded up, so the last day reads "1 day" rather than "0 days". Nobody is
 * counting hours, and a countdown that reaches nought while the thing is still
 * on screen reads as broken.
 */
export function daysUntilArchive(task: RepairTask, now: number): number | null {
  if (!task.done) return null;

  const at = task.doneAt?.toMillis();
  if (at === undefined) return ARCHIVE_AFTER_DAYS;

  const left = Math.ceil((at + ARCHIVE_AFTER_DAYS * DAY_MS - now) / DAY_MS);
  return left > 0 ? left : null;
}

/**
 * The order the board reads in.
 *
 * Grounded first and always. Every other task is work to be scheduled; a
 * grounded van is a van that does not go out in the morning, and it should be
 * at the top of the screen whoever opens it and however long it has been
 * there. After that, newest first — the board is read from the top by someone
 * catching up on last night.
 *
 * The timestamps are read with an estimate behind them, so a task added
 * seconds ago sorts where it was put rather than jumping when the server
 * acknowledges it.
 */
export function byUrgency(a: RepairTask, b: RepairTask): number {
  if (a.grounded !== b.grounded) return a.grounded ? -1 : 1;
  return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
}

/** Ticked-off tasks, most recently finished first. */
export function byFinished(a: RepairTask, b: RepairTask): number {
  return (b.doneAt?.toMillis() ?? 0) - (a.doneAt?.toMillis() ?? 0);
}
