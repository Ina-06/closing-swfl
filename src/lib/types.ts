import type { Timestamp } from "firebase/firestore";

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
