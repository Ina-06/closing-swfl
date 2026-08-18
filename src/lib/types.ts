import type { Timestamp } from "firebase/firestore";
import type { ReturnsReason } from "@/lib/returns";
import type { Metric } from "@/lib/constants";

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
   * Separate from `clockOut` on purpose. That one is stamped by the server the
   * moment Karim taps Arrived; this one is hearsay relayed over the phone, and
   * the two should never be mistaken for each other.
   */
  clockOutManual: string;

  // Closer-owned
  /** Either side may set this — the dispatcher clocks out task drivers early. */
  status: "enroute" | "arrived";
  clockOut: Timestamp | null;
  van: string;
  vanIssues: string;
  cell: boolean | null;
  key: boolean | null;
  fuel: boolean | null;
  /** Turned up without being announced. The dispatcher fills the rest in after. */
  addedByCloser: boolean;

  updatedAt: Timestamp | null;
  updatedBy: string;
};

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
  allReturningAt: Timestamp | null;
  closedAt: Timestamp | null;
  pdfUrl: string | null;
  returnsXlsxUrl: string | null;
};
