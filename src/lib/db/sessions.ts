"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { stationNightKey } from "@/lib/constants";
import type { RosterEntry, Session } from "@/lib/types";

const COLLECTION = "sessions";

/**
 * Tonight's session, live, or null if the roster has not been set up yet.
 *
 * The id is the night key, not the calendar date — see stationNightKey. The
 * key is resolved after mount so a phone that sits through the rollover hour
 * picks up the new night when it comes back to the foreground.
 */
export function useTonightSession() {
  const [nightKey, setNightKey] = useState<string | null>(null);
  /**
   * The snapshot is stamped with the night it belongs to. Loading is then
   * derived rather than toggled, so the rollover to a new night can never
   * leave last night's roster on screen while the new one is still resolving.
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
          session: document.exists() ? (document.data() as Session) : null,
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
  wave: string;
  managedBy: string;
  roster: RosterEntry[];
  updatedBy: string;
};

/**
 * Create tonight's session, or update the roster on one that already exists.
 *
 * `merge: true` and the explicit field list matter: re-saving the roster after
 * All Returning has been called must not reset status, and must not wipe the
 * pdf and spreadsheet urls. Nothing here can remove a session — there is no
 * delete path in the app at all.
 */
export async function saveRoster({
  nightKey,
  wave,
  managedBy,
  roster,
  updatedBy,
}: RosterInput) {
  await setDoc(
    doc(getDb(), COLLECTION, nightKey),
    {
      date: nightKey,
      wave: wave.trim(),
      managedBy: managedBy.trim(),
      roster,
      totalExpected: roster.length,
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true },
  );
}

/** Fills in the fields a brand new session needs, without touching an existing one. */
export async function createSession(input: RosterInput) {
  await setDoc(
    doc(getDb(), COLLECTION, input.nightKey),
    {
      status: "open",
      allReturningAt: null,
      closedAt: null,
      pdfUrl: null,
      returnsXlsxUrl: null,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
  await saveRoster(input);
}

export async function touchSession(nightKey: string, updatedBy: string) {
  await updateDoc(doc(getDb(), COLLECTION, nightKey), {
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}
