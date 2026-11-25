"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  getDocFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { endFleetRound, startFleetRound } from "@/lib/db/fleet";
import { stationNightKey } from "@/lib/constants";
import type { ArchivedPdf, RosterEntry, Session } from "@/lib/types";

const COLLECTION = "sessions";

/**
 * Read a session document defensively.
 *
 * Firestore delivers a local snapshot the instant a write is queued, so the
 * UI can briefly see a half-written document. Every field gets a default here
 * rather than being trusted — a missing `roster` used to crash the summary
 * screen the moment a session was created.
 */
function toSession(data: DocumentData, id: string): Session {
  const roster: RosterEntry[] = Array.isArray(data.roster)
    ? data.roster.map((row: DocumentData) => ({
        driverId: String(row?.driverId ?? ""),
        fullName: String(row?.fullName ?? ""),
        isBud: row?.isBud === true,
        isTrainer: row?.isTrainer === true,
        isRescuer: row?.isRescuer === true,
      }))
    : [];

  /** Strings only, keyed by driverId. Anything else in there is not a note. */
  const rosterNotes: Record<string, string> = {};
  if (data.rosterNotes && typeof data.rosterNotes === "object") {
    for (const [driverId, note] of Object.entries(data.rosterNotes)) {
      if (typeof note === "string" && note.trim() !== "") {
        rosterNotes[driverId] = note;
      }
    }
  }

  /** The same shape and the same defensiveness, for HR's map. */
  const timeEdits: Record<string, string> = {};
  if (data.timeEdits && typeof data.timeEdits === "object") {
    for (const [driverId, edit] of Object.entries(data.timeEdits)) {
      if (typeof edit === "string" && edit.trim() !== "") {
        timeEdits[driverId] = edit;
      }
    }
  }

  return {
    date: typeof data.date === "string" ? data.date : id,
    managedBy: typeof data.managedBy === "string" ? data.managedBy : "",
    status:
      data.status === "closed" || data.status === "allReturning"
        ? data.status
        : "open",
    totalExpected:
      typeof data.totalExpected === "number" ? data.totalExpected : roster.length,
    roster,
    rosterNotes,
    timeEdits,
    // One string, not a map. Anything else in the field is not a note, and a
    // blank one is the same as none at all — see saveBroadcastNote.
    broadcastNote:
      typeof data.broadcastNote === "string" ? data.broadcastNote.trim() : "",
    allReturningAt: data.allReturningAt ?? null,
    closedAt: data.closedAt ?? null,
    closedBy:
      data.closedBy === "auto" || data.closedBy === "manual"
        ? data.closedBy
        : null,
    archivedPdf: toArchivedPdf(data.archivedPdf),
    pdfVersions: Array.isArray(data.pdfVersions)
      ? data.pdfVersions
          .map(toArchivedPdf)
          .filter((pdf: ArchivedPdf | null): pdf is ArchivedPdf => pdf !== null)
      : [],
  };
}

/**
 * One filed PDF, or null if what is there is not one.
 *
 * The path is the only field that matters — without it there is nothing to
 * fetch — so a record with no path is treated as no record at all rather than
 * a button that opens nothing.
 */
function toArchivedPdf(raw: unknown): ArchivedPdf | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as DocumentData;
  if (typeof data.path !== "string" || data.path === "") return null;
  return {
    path: data.path,
    at: data.at ?? null,
    by: typeof data.by === "string" ? data.by : "",
    auto: data.auto === true,
    rows: typeof data.rows === "number" ? data.rows : 0,
    closedAt: data.closedAt ?? null,
  };
}

/**
 * Tonight's session, live, or null if the roster has not been set up yet.
 *
 * The id is the night key, not the calendar date — see stationNightKey. It is
 * resolved after mount and re-resolved on focus, so a phone that sits through
 * the rollover hour picks up the new night when it comes back.
 */
export function useTonightSession() {
  const [nightKey, setNightKey] = useState<string | null>(null);
  /**
   * The snapshot is stamped with the night it belongs to, so loading is
   * derived rather than toggled. The rollover to a new night can never leave
   * last night's roster on screen while the new one is still resolving.
   */
  const [snapshot, setSnapshot] = useState<{
    key: string;
    session: Session | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setNightKey(stationNightKey());
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    if (!nightKey) return;

    return onSnapshot(
      doc(getDb(), COLLECTION, nightKey),
      (document) => {
        setSnapshot({
          key: nightKey,
          session: document.exists()
            ? toSession(
                // Same reason as the entries listener: closedAt is a server
                // timestamp, and End Day happens in the yard.
                document.data({ serverTimestamps: "estimate" }),
                document.id,
              )
            : null,
        });
        setError(null);
      },
      (snapshotError) => {
        setSnapshot({ key: nightKey, session: null });
        setError(snapshotError.message);
      },
    );
  }, [nightKey]);

  const settled = snapshot?.key === nightKey ? snapshot : null;

  return {
    nightKey,
    session: settled?.session ?? null,
    loading: !nightKey || settled === null,
    error,
  };
}

type RosterInput = {
  nightKey: string;
  managedBy: string;
  roster: RosterEntry[];
  updatedBy: string;
};

/**
 * Create tonight's session, or update the roster on one that already exists.
 *
 * Deliberately a single write. Splitting it in two published a session
 * document with no `roster` field for the moment between them, which every
 * live listener saw. One document, one snapshot, no half-built night.
 *
 * `merge: true` and the explicit field list matter too: re-saving the roster
 * after All Returning has been called must not reset the status or clear the
 * times stamped on it. Nothing here can remove a session — there is no delete
 * path in the app at all.
 */
export async function saveRoster({
  nightKey,
  managedBy,
  roster,
  updatedBy,
}: RosterInput) {
  await setDoc(
    doc(getDb(), COLLECTION, nightKey),
    {
      date: nightKey,
      managedBy: managedBy.trim(),
      roster,
      totalExpected: roster.length,
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true },
  );
}

export async function createSession(input: RosterInput) {
  await setDoc(
    doc(getDb(), COLLECTION, input.nightKey),
    {
      date: input.nightKey,
      managedBy: input.managedBy.trim(),
      roster: input.roster,
      totalExpected: input.roster.length,
      status: "open",
      allReturningAt: null,
      closedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: input.updatedBy,
    },
    { merge: true },
  );

  // A new day empties the list of available vans and fuel cards, if End Day
  // did not already. Not awaited and never allowed to fail the roster: the
  // night starting is the thing that matters here. See startFleetRound.
  startFleetRound(input.nightKey, input.updatedBy).catch((error: unknown) =>
    console.warn("Could not empty the available vans and fuel cards:", error),
  );
}

/**
 * The wave is over — everyone still out is on their way back.
 *
 * Written from the client rather than from the spreadsheet route on purpose.
 * This is the half that reaches the closer's phone, and it reaches it through the
 * listener he already has open, in the time it takes Firestore to acknowledge
 * one field. Making it wait on a workbook being generated would put a
 * spreadsheet in front of the thing it is announcing.
 */
export async function markAllReturning(nightKey: string, updatedBy: string) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    status: "allReturning",
    allReturningAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * End Day. The night stops being tonight.
 *
 * Sets a status and a time; it does not remove anything, here or anywhere.
 * The PDF is generated separately, for the same reason All Returning splits in
 * two — the sheet is closed the moment he says so, and a document being
 * rendered is not a reason to leave him looking at a spinner. Filing the PDF
 * in Storage is separate again (EndDay calls /api/sheet/archive), and if that
 * never lands the hourly job files it instead.
 *
 * Rejected by the rules if the night is already closed. That is the 7 AM job
 * having got there first while this write sat queued on a phone with no
 * signal, and the close it already made — its time, its PDF — is the one that
 * stands. See isAlreadyClosed.
 */
export async function closeSession(nightKey: string, updatedBy: string) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    status: "closed",
    closedAt: serverTimestamp(),
    // Said out loud, because the server closes nights too now — see
    // /api/cron/autoclose. "manual" is the only value the rules let a phone
    // write here; "auto" is the server's alone.
    closedBy: "manual",
    updatedAt: serverTimestamp(),
    updatedBy,
  });

  // The list of available vans and fuel cards empties. Separate from the close
  // and never allowed to fail it — End Day is the last thing the closer does all
  // night, and a list on another screen is not a reason to show him an error.
  // Touches the round marker only: nothing is deleted, and nothing on the
  // repairs board is touched.
  endFleetRound(nightKey, updatedBy).catch((error: unknown) =>
    console.warn("Could not empty the available vans and fuel cards:", error),
  );
}

/**
 * Whether a failed close failed because the night was closed already.
 *
 * The rules turn away a close on a closed night, and Firestore reports that as
 * permission-denied. On End Day that is not an error worth a red box: the night
 * is closed, which is what he asked for.
 */
export async function isAlreadyClosed(
  nightKey: string,
  error: unknown,
): Promise<boolean> {
  const denied =
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "permission-denied";
  if (!denied) return false;

  // Permission-denied has other causes too — a stand-in's code revoked
  // mid-night is one — so the night itself is asked, from the server rather
  // than the cache, before the error is called anything other than an error.
  try {
    const fresh = await getDocFromServer(doc(getDb(), COLLECTION, nightKey));
    return fresh.data()?.status === "closed";
  } catch {
    return false;
  }
}

/**
 * Closed by mistake, or a driver turned up after End Day.
 *
 * The dispatcher's only, because it undoes something the closer did and the two of
 * them are not in the same room. Still not a delete — closedAt is cleared, the
 * night itself is untouched.
 */
export async function reopenSession(nightKey: string, updatedBy: string) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    status: "allReturning",
    closedAt: null,
    // An open night has not been closed by anybody. The filed PDFs stay
    // exactly where they are — archivedPdf and pdfVersions are not touched,
    // and the next close files a new version beside them.
    closedBy: deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * Every night on record, most recent first.
 *
 * Capped rather than paged: a station does one of these a day, so sixty is two
 * months of history and more than anyone has ever scrolled back through.
 */
export function useSessions(max = 60) {
  const [sessions, setSessions] = useState<{ id: string; session: Session }[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(getDb(), COLLECTION), orderBy("date", "desc"), limit(max)),
      (snapshot) => {
        setSessions(
          snapshot.docs.map((document) => ({
            id: document.id,
            session: toSession(document.data(), document.id),
          })),
        );
        setError(null);
      },
      (snapshotError) => {
        setSessions([]);
        setError(snapshotError.message);
      },
    );
  }, [max]);

  return { sessions, loading: sessions === null, error };
}

/**
 * A note about a driver who has no row yet.
 *
 * One field path, not the whole map, so two notes written a second apart on two
 * devices cannot overwrite each other. An empty note deletes the key rather
 * than storing a blank — clearing the box has to actually clear it, and a map
 * full of empty strings would put a "Note" badge on drivers who have none.
 *
 * It stays put after the driver gets a row. The row already carries a copy by
 * then, and leaving this one alone means a row deleted in error takes his note
 * back to the dashed card rather than losing it — which is the behaviour worth
 * having, and one fewer write in the path that creates the row.
 */
export async function saveRosterNote(
  nightKey: string,
  driverId: string,
  notes: string,
  updatedBy: string,
) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    [`rosterNotes.${driverId}`]: notes.trim() === "" ? deleteField() : notes,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * HR's change to a driver's hours, pasted as they wrote it.
 *
 * One field path for the same reason the note above uses one: two edits typed a
 * second apart, on two drivers, must not overwrite each other. Clearing the box
 * deletes the key rather than storing a blank — an edit taken back has to
 * actually come off both screens, and a map of empty strings would leave a
 * "Time edit" tag on drivers who no longer have one.
 *
 * The text is stored verbatim, newlines and all. It is a paste out of whatever
 * HR keeps the hours in, and reformatting somebody's record on the way past is
 * not this app's business.
 */
export async function saveTimeEdit(
  nightKey: string,
  driverId: string,
  edit: string,
  updatedBy: string,
) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    [`timeEdits.${driverId}`]: edit.trim() === "" ? deleteField() : edit,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * The one thing everybody needs to hear tonight.
 *
 * One field on the night rather than a note copied onto every row. Written from
 * either side, because whoever knows the thing is the one who should be able to
 * say it — the dispatcher hours before the wave goes out, or the closer at the gate
 * when he finds it is locked.
 *
 * Cleared by emptying the box, and cleared means an empty string rather than a
 * deleted field. Unlike the two maps above it this is a single value that every
 * screen reads on every render, and a field that is sometimes absent and
 * sometimes blank is two ways of saying nothing for every reader to handle.
 *
 * It overwrites rather than joining. A broadcast is one sentence the station is
 * saying right now; the second one replaces the first, which is the whole
 * difference between this and the note on a driver — that one is a growing
 * record of a man's night and opens with whatever is already there.
 */
export async function saveBroadcastNote(
  nightKey: string,
  note: string,
  updatedBy: string,
) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    broadcastNote: note.trim(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function touchSession(nightKey: string, updatedBy: string) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}
