"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
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
import { stationNightKey } from "@/lib/constants";
import type { RosterEntry, Session } from "@/lib/types";

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
    allReturningAt: data.allReturningAt ?? null,
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
}

/**
 * The wave is over — everyone still out is on their way back.
 *
 * Written from the client rather than from the spreadsheet route on purpose.
 * This is the half that reaches Karim's phone, and it reaches it through the
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
 * rendered is not a reason to leave him looking at a spinner.
 */
export async function closeSession(nightKey: string, updatedBy: string) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    status: "closed",
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * Closed by mistake, or a driver turned up after End Day.
 *
 * The dispatcher's only, because it undoes something Karim did and the two of
 * them are not in the same room. Still not a delete — closedAt is cleared, the
 * night itself is untouched.
 */
export async function reopenSession(nightKey: string, updatedBy: string) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    status: "allReturning",
    closedAt: null,
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

export async function touchSession(nightKey: string, updatedBy: string) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}
