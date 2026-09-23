import type { Timestamp } from "firebase/firestore";
import type { ReturnsReason } from "@/lib/returns";
import type { CheckField, Metric } from "@/lib/constants";

/**
 * A person on the roster. The full name is canonical and is copied onto the
 * session roster and onto every entry, so editing or removing someone here
 * never rewrites a sheet that has already been closed.
 */
export type Driver = {
  id: string;
  fullName: string;
  /** Normalised for matching a pasted line against this record. Never displayed. */
  nameKey: string;
  createdAt: Timestamp | null;
};

/**
 * One line of tonight's roster, after matching.
 *
 * The three flags live here and nowhere else. They describe the night, not the
 * person — who is training or on rescues changes wave to wave — so they are
 * set on the roster and are not editable from the driver database.
 */
export type RosterEntry = {
  driverId: string;
  fullName: string;
  /** Leaves early. */
  isBud: boolean;
  /** Training tonight. */
  isTrainer: boolean;
  /** On rescues tonight. */
  isRescuer: boolean;
};

export type SessionStatus = "open" | "allReturning" | "closed";

/**
 * Where a driver is in the close.
 *
 * Three states, not two. `arrived` is the van standing in the yard with Karim
 * at it, part-way through the handover; `clockedOut` is the handover finished
 * and the time on the record. Collapsing them meant tapping Arrived stamped a
 * time before anyone had looked at the van, which is not what happens.
 */
export type EntryStatus = "enroute" | "arrived" | "clockedOut";

/**
 * One driver's line on tonight's sheet.
 *
 * Split down the middle by who owns what: the dispatcher owns everything the
 * driver said on the phone, the closer owns everything that happened in the
 * yard. firestore.rules enforces that split, so a stale phone can never
 * overwrite a live edit on the other side.
 *
 * fullName is a copy, not a reference. Renaming or deleting a driver later
 * leaves this line reading exactly as it does tonight.
 */
export type Entry = {
  id: string;
  /** Row number on the PDF. Survives a deletion — it is max+1, not a count. */
  seq: number;
  driverId: string;
  fullName: string;
  isBud: boolean;
  isTrainer: boolean;
  isRescuer: boolean;

  // Dispatcher-owned
  /** Typed plainly, e.g. "9:45". Never parsed, never a picker. */
  eta: string;
  /** Verbatim, always. See lib/returns. */
  returnsRaw: string;
  returnsCount: number | null;
  returnsReasons: ReturnsReason[];
  returnsMismatch: boolean;
  performance: "up" | "down" | null;
  metric: Metric | null;
  infractions: string;
  /** Signed, in packages: +23 he picked up, -11 taken off him. */
  rescues: number;
  /** Anything Karim needs to know about this driver. Surfaced on his card. */
  notes: string;
  /**
   * A clock-out the driver reported to the dispatcher, typed by hand.
   *
   * Separate from `clockOut` on purpose. That one is stamped by the server when
   * Karim clocks him out at the van; this one is hearsay relayed over the
   * phone, and the two should never be mistaken for each other.
   */
  clockOutManual: string;

  // Closer-owned
  /** Either side may set this — the dispatcher clocks out task drivers early. */
  status: EntryStatus;
  clockOut: Timestamp | null;
  van: string;
  /**
   * Whether there is anything wrong with the van at all.
   *
   * The same three states as the checks, and it is the gate in front of the two
   * fields below it: crossed means there is something to write, and the box and
   * the Grounded switch appear. Ticked means he looked and it is fine — which is
   * a different thing from nobody having looked, and the reason this is not a
   * plain boolean.
   */
  vanOk: boolean | null;
  vanIssues: string;
  /**
   * The van is off the road until someone deals with it.
   *
   * Two states, not the three the checks have. A check that nobody has looked
   * at yet is real information; a van nobody has grounded is simply not
   * grounded, and there is no third thing it could be.
   */
  grounded: boolean;
  fuel: boolean | null;
  key: boolean | null;
  charger: boolean | null;
  mobile: boolean | null;
  snack: boolean | null;
  lights: boolean | null;
  bungees: boolean | null;
  doors: boolean | null;
  tires: boolean | null;
  /**
   * Turned up without being announced, and is not on tonight's roster either.
   *
   * Nobody knew he was coming — that is what the badge on both screens means,
   * and why it is worth one. A driver Karim gets to before the dispatcher does
   * is not this: his name is on the roster, he was expected, and the only thing
   * missing is the ETA the dispatcher has not typed yet.
   */
  addedByCloser: boolean;
  /**
   * A driver's second turn of the night, on a row of his own.
   *
   * He went back out and came in again, so there are two vans, two sets of
   * checks and two times against one name — and one row cannot hold that. This
   * one's time is typed rather than stamped: by the time Karim is putting it in
   * he is recording a trip, not standing at the end of one.
   *
   * Written once, when the row is created, and never touched again. It is a
   * fact about why the row exists.
   */
  secondTrip: boolean;

  updatedAt: Timestamp | null;
  updatedBy: string;
};

/**
 * The handover checks as stored.
 *
 * Keyed off CHECKS, so adding a seventh thing to look at is one line in
 * constants and a type error everywhere that has to render it.
 */
export type EntryChecks = Pick<Entry, CheckField>;

/** The dispatcher's half of an entry — the only fields this role may write. */
export type EntryDispatchFields = Pick<
  Entry,
  | "eta"
  | "returnsRaw"
  | "returnsCount"
  | "returnsReasons"
  | "returnsMismatch"
  | "performance"
  | "metric"
  | "infractions"
  | "rescues"
  | "notes"
  | "clockOutManual"
  | "status"
>;

/**
 * One thing wrong with a van, on a list that outlives the night it came off.
 *
 * Everything on it is a copy, and that is the whole point. A repair is opened
 * on one night and closed on another, often weeks later, and by then the entry
 * it came from is buried in a closed session and the driver may not work here
 * any more. So the van number, the driver's name and the night are written
 * onto the task as text — the same reason `fullName` is copied onto an entry.
 * Nothing on this board ever has to go and look a night up, and no correction
 * made to a past sheet can change what a mechanic was asked to do.
 *
 * There is no reference back to the entry for the same reason. The task is the
 * record now.
 */
export type RepairTask = {
  id: string;
  /**
   * The whole job, as one line: "63 - Pass side out".
   *
   * For a task End Day posted this is the van number and then the van issues
   * column exactly as it reads on the PDF, GROUNDED and all. The board and the
   * sheet saying two different things about one van is the failure worth
   * designing against, so nothing is reworded on the way across.
   *
   * There is no van field beside it and no notes field under it. The van
   * number is the front of the line because that is how the yard says it, and
   * one box is one thing to fill in at midnight.
   */
  title: string;
  /** Posted by End Day, or typed on the board by hand. */
  source: "endDay" | "manual";
  /** The night it came off, `YYYY-MM-DD`, or "" for one typed here. */
  nightKey: string;
  /** Who brought the van in. "" for a task typed on the board. */
  driverName: string;
  /**
   * The line, normalised — what stops the same fault landing twice.
   *
   * End Day compares this against every task already on the board and drops
   * the ones that match something still open. A van that is broken for a week
   * is one line to tick off, not seven identical ones. See lib/repairs.
   */
  matchKey: string;
  done: boolean;
  /** When it was ticked off. The archive clock runs from here. */
  doneAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  updatedBy: string;
};

export type Session = {
  /** Document id and date, both `YYYY-MM-DD` — see stationNightKey. */
  date: string;
  managedBy: string;
  status: SessionStatus;
  totalExpected: number;
  /**
   * Tonight's roster, denormalised onto the session.
   *
   * Entries are created one at a time as drivers text in (Phase 3), so the
   * roster is what remembers who was expected and how they were flagged. It is
   * small — one wave — and read as part of the session document.
   */
  roster: RosterEntry[];
  /**
   * Notes Karim has left himself about drivers who have no row yet, by driverId.
   *
   * They live on the session rather than as entries because creating a row is
   * not a neutral act: a row means dispatch has heard from him, it takes his
   * name off the still-to-call-in list, and the next thing anyone does — the
   * dispatcher entering him properly — would add a *second* row for the same
   * driver. Half of what Karim wants to write down is about a driver nobody has
   * heard from yet, so the note has to be able to exist before the row does.
   *
   * It moves onto the entry the moment one is created, wherever it is created
   * from. Until then it shows on his dashed card, and the driver stays exactly
   * what he is: on the roster, still out, not yet entered.
   */
  rosterNotes: Record<string, string>;
  /**
   * What HR has changed about a driver's hours, by driverId, pasted verbatim.
   *
   * Keyed by driver rather than by entry, and deliberately never copied onto
   * one. Three reasons, and they are the same three every time:
   *
   *   - HR writes hours before the wave is back and often before the driver has
   *     phoned in at all, so there is frequently no row to write on;
   *   - a driver's second trip is a second row under one name, and his hours
   *     were edited once, for the man, not twice, once per van;
   *   - a row removed in error must not take the edit with it. Nothing in this
   *     app can delete a session, so a note on one is the safest place it can be.
   *
   * Separate from `notes`, which is the amber strip and is shared between the
   * desk and the yard. That one is about the handover — take his badge, the ramp
   * is jammed. This one is a payroll correction, it arrives already written in
   * HR's own words, and letting either overwrite the other would be losing
   * something somebody typed on purpose.
   *
   * Multi-line, because it is pasted. Every place that renders it keeps the
   * breaks.
   */
  timeEdits: Record<string, string>;
  allReturningAt: Timestamp | null;
  closedAt: Timestamp | null;
};
