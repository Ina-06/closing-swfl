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
 *
 * A job is one line of text and nothing else. There is no van column, no notes
 * field and no off-the-road flag: the van number is the front of the line —
 * "63 - Pass side out" — because that is how the yard says it out loud, and a
 * board with one box on it is a board nobody has to be taught.
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
 * "#150" all turn up, and all of them mean 150. Left alone, the job would read
 * "VAN 150 - Pass side out", which is the same word twice as far as anybody
 * reading the board is concerned.
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
 * Two ways of writing the same job.
 *
 * Deliberately shallow. Case, accents, spacing and trailing punctuation are
 * noise; every actual word is signal. "63 - Mirror cracked" and "63 - Cracked
 * mirror" are left as two different jobs, because deciding they are the same
 * means deciding which one the mechanic reads, and this file is not entitled
 * to that.
 *
 * The van number rides inside the key for free, because it is the front of the
 * line rather than a field of its own: 63 and 214 with the same fault are two
 * jobs, as they should be, and a line typed by hand on the board matches the
 * one End Day posts for the same van tomorrow.
 */
export function matchKeyFor(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!]+$/, "")
    .trim();
}

/**
 * Van number and fault, as the one line a job is.
 *
 * "63 - Pass side out". A space, a dash and a space, because that is what
 * somebody writing it on a whiteboard does, and because a bare "63 Pass side
 * out" reads as a sentence that happens to start with a number.
 *
 * A van with no number written against it is still a job. It loses the prefix
 * rather than gaining a dash with nothing in front of it.
 */
export function repairTitle(van: string, fault: string): string {
  const number = cleanVan(van);
  const said = fault.trim();
  return number === "" ? said : `${number} - ${said}`;
}

/** A task before it has a document — what End Day and the composer both build. */
export type NewRepair = {
  title: string;
  source: RepairTask["source"];
  nightKey: string;
  driverName: string;
  matchKey: string;
};

/** Hand-typed on the board. No night, no driver — just the line. */
export function manualRepair(title: string): NewRepair {
  return {
    title,
    source: "manual",
    nightKey: "",
    driverName: "",
    matchKey: matchKeyFor(title),
  };
}

/**
 * What tonight's sheet puts on the board.
 *
 * One task per van that came back with something wrong with it, written as the
 * van number and then the whole van issues column rather than a sentence out
 * of it. The column is written by three controls and a free-text box joined
 * with full stops — "GROUNDED. No fuel. Nearside mirror is hanging off" — and
 * splitting on those stops would cut the sentence Karim typed in half the
 * moment he used one himself. What the mechanic gets is what is on the sheet,
 * with the van in front of it.
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
    const fault = entry.vanIssues.trim();
    if (fault === "") continue;

    const title = repairTitle(entry.van, fault);
    const matchKey = matchKeyFor(title);
    // The same van twice on one night is a second trip, and a fault reported
    // on both trips is still one fault.
    if (seen.has(matchKey)) continue;
    seen.add(matchKey);

    tasks.push({
      title,
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
 * The order the board reads in: newest first.
 *
 * Nothing on the board outranks anything else on it. A job is a line of text
 * somebody has to see to, and which van is worse off is a judgement the
 * mechanic makes by reading the line — the sheet already says GROUNDED in it
 * when that is the case — not one this file can make from a flag. So the board
 * is read from the top by whoever is catching up on last night.
 *
 * The timestamps are read with an estimate behind them, so a task added
 * seconds ago sorts where it was put rather than jumping when the server
 * acknowledges it.
 */
export function byNewest(a: RepairTask, b: RepairTask): number {
  return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
}

/** Ticked-off tasks, most recently finished first. */
export function byFinished(a: RepairTask, b: RepairTask): number {
  return (b.doneAt?.toMillis() ?? 0) - (a.doneAt?.toMillis() ?? 0);
}

/**
 * The board by name, which on this board means by van.
 *
 * A job is "63 - Pass side out", so the front of the line is nearly always the
 * van number and sorting by name is sorting by van. That is the whole reason
 * anybody wants it: three jobs on 214 are scattered down a list ordered by
 * when they were reported, and somebody about to work on 214 wants them
 * together.
 *
 * `numeric` is what makes that true rather than nearly true. Plain string
 * order puts 214 before 63 before 7, because it compares the first character
 * and stops — which on a list of van numbers is not alphabetical order, it is
 * nonsense. With it, 7, 63 and 214 come out in the order a person would read
 * them out, and a van called VANGUARD1 still sorts under V.
 *
 * `sensitivity: "base"` so a line typed in capitals at midnight does not sort
 * into its own group away from the same van written in lower case.
 *
 * Ties fall back to newest first, so two jobs on one van stay in a stable,
 * meaningful order rather than shuffling when a snapshot lands.
 */
export function byTitle(a: RepairTask, b: RepairTask): number {
  return (
    a.title.localeCompare(b.title, undefined, {
      numeric: true,
      sensitivity: "base",
    }) || byNewest(a, b)
  );
}

/**
 * How long a job has been on the board, in whole days.
 *
 * Measured from when it was written, never from the night it came off. Those
 * are usually the same evening and occasionally are not — a fault typed onto
 * the board by hand has no night at all — and the question this answers is how
 * long the job has been sitting there, which is a fact about the board.
 *
 * Floored, so it reads as days completed: a job opened this evening is 0 and
 * says "Today", and it does not become "1 day" until a day has actually passed.
 * The opposite of the archive countdown above, which rounds up because nobody
 * wants to watch a deadline reach nought while the thing is still on screen.
 *
 * Clamped at zero. `now` is floored to the hour and `createdAt` is read with a
 * local estimate behind it, so a job added two minutes ago can briefly carry a
 * stamp in front of the clock, and "-0 days" on a fresh row would be the first
 * thing anybody noticed about this board.
 *
 * Null when there is no stamp yet at all, which is the moment between a job
 * being typed and the write landing.
 */
export function daysOpen(task: RepairTask, now: number): number | null {
  const at = task.createdAt?.toMillis();
  if (at === undefined) return null;

  return Math.max(0, Math.floor((now - at) / DAY_MS));
}
