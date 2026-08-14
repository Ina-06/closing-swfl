import type { Timestamp } from "firebase/firestore";

/**
 * A person on the roster. The full name is canonical and is copied onto every
 * entry when a session is built, so renaming someone here never rewrites a
 * sheet that has already been closed.
 */
export type Driver = {
  id: string;
  fullName: string;
  /** Normalised for matching a pasted line against this record. Never displayed. */
  nameKey: string;
  active: boolean;
  /** Usually leaves early. Pre-ticks the BUD toggle on the roster. */
  isBudDefault: boolean;
  createdAt: Timestamp | null;
};

/** One line of tonight's roster, after matching. */
export type RosterEntry = {
  driverId: string;
  fullName: string;
  isBud: boolean;
};

export type SessionStatus = "open" | "allReturning" | "closed";

export type Session = {
  /** Document id and date, both `YYYY-MM-DD` — see stationNightKey. */
  date: string;
  wave: string;
  managedBy: string;
  status: SessionStatus;
  totalExpected: number;
  /**
   * Tonight's roster, denormalised onto the session.
   *
   * Entries are created one at a time as drivers text in (Phase 3), so the
   * roster is what remembers who was expected and which of them are BUDs. It
   * is small — one wave — and read as part of the session document.
   */
  roster: RosterEntry[];
  allReturningAt: Timestamp | null;
  closedAt: Timestamp | null;
  pdfUrl: string | null;
  returnsXlsxUrl: string | null;
};
