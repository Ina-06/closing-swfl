"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { setQueued } from "@/lib/sync";
import { METRICS } from "@/lib/constants";
import type { Entry, EntryDispatchFields, RosterEntry } from "@/lib/types";
import type { ParsedReturns } from "@/lib/returns";

const METRIC_VALUES = new Set<string>(METRICS.map((metric) => metric.value));

function entriesCollection(nightKey: string) {
  return collection(getDb(), "sessions", nightKey, "entries");
}

/**
 * Read an entry defensively.
 *
 * The dispatcher's laptop and the closer's phone write to the same document
 * from opposite sides, and Firestore surfaces local writes before they land.
 * Every field gets a default so a half-applied update can never crash a screen
 * mid-wave.
 */
/**
 * Which of the three states this entry is in.
 *
 * Nights written before the split stored one `arrived` for both being in the
 * yard and being finished with, and the stamp is what tells those apart — a
 * driver with a clock-out on him was always done. New writes say `clockedOut`
 * outright, so this only ever fires on history.
 */
function readStatus(data: DocumentData): Entry["status"] {
  if (data.status === "clockedOut") return "clockedOut";
  if (data.status === "arrived") return data.clockOut ? "clockedOut" : "arrived";
  return "enroute";
}

function toEntry(data: DocumentData, id: string): Entry {
  const string = (value: unknown) => (typeof value === "string" ? value : "");
  const check = (value: unknown) => (typeof value === "boolean" ? value : null);

  return {
    id,
    seq: typeof data.seq === "number" ? data.seq : 0,
    driverId: string(data.driverId),
    fullName: string(data.fullName),
    isBud: data.isBud === true,
    isTrainer: data.isTrainer === true,
    isRescuer: data.isRescuer === true,

    eta: string(data.eta),
    returnsRaw: string(data.returnsRaw),
    returnsCount: typeof data.returnsCount === "number" ? data.returnsCount : null,
    returnsReasons: Array.isArray(data.returnsReasons)
      ? data.returnsReasons.map((reason: DocumentData) => ({
          count: typeof reason?.count === "number" ? reason.count : 0,
          text: string(reason?.text),
        }))
      : [],
    returnsMismatch: data.returnsMismatch === true,
    performance:
      data.performance === "up" || data.performance === "down"
        ? data.performance
        : null,
    metric: METRIC_VALUES.has(data.metric) ? data.metric : null,
    infractions: string(data.infractions),
    rescues: typeof data.rescues === "number" ? data.rescues : 0,
    notes: string(data.notes),
    clockOutManual: string(data.clockOutManual),

    status: readStatus(data),
    clockOut: data.clockOut ?? null,
    van: string(data.van),
    vanIssues: string(data.vanIssues),
    grounded: data.grounded === true,
    fuel: check(data.fuel),
    key: check(data.key),
    charger: check(data.charger),
    // Was `cell` when the list was three long. Old sheets keep reading right.
    mobile: check(data.mobile ?? data.cell),
    snack: check(data.snack),
    lights: check(data.lights),
    addedByCloser: data.addedByCloser === true,

    updatedAt: data.updatedAt ?? null,
    updatedBy: string(data.updatedBy),
  };
}

/** Tonight's entries, live, in the order they will be numbered on the PDF. */
export function useEntries(nightKey: string | null) {
  const [snapshot, setSnapshot] = useState<{
    key: string;
    entries: Entry[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nightKey) return;

    return onSnapshot(
      query(entriesCollection(nightKey), orderBy("seq")),
      // Metadata changes carry hasPendingWrites, which is the only way to know
      // a tap has not reached the server yet. Without this the callback fires
      // on data alone and the sync dot would never come on.
      { includeMetadataChanges: true },
      (result) => {
        setQueued(result.metadata.hasPendingWrites);
        setSnapshot({
          key: nightKey,
          entries: result.docs.map((document) =>
            /**
             * "estimate" matters more than it looks.
             *
             * A clock-out is written as serverTimestamp(), which has no value
             * until the server has seen it. Offline that is null, and the card
             * would show a driver as clocked out with no time against him —
             * exactly the moment Karim most needs to trust the screen. The
             * estimate is the phone's clock, replaced by the real one the
             * instant it syncs.
             */
            toEntry(document.data({ serverTimestamps: "estimate" }), document.id),
          ),
        });
        setError(null);
      },
      (snapshotError) => {
        setQueued(false);
        setSnapshot({ key: nightKey, entries: [] });
        setError(snapshotError.message);
      },
    );
  }, [nightKey]);

  const settled = snapshot?.key === nightKey ? snapshot : null;

  return {
    entries: settled?.entries ?? [],
    loading: !nightKey || settled === null,
    error,
  };
}

/** Fold a parsed returns string into the three fields that store it. */
export function returnsFields(parsed: ParsedReturns) {
  return {
    returnsRaw: parsed.raw,
    returnsCount: parsed.count,
    returnsReasons: parsed.reasons,
    returnsMismatch: parsed.mismatch,
  };
}

export type NewEntry = EntryDispatchFields & {
  driverId: string;
  fullName: string;
  roster?: RosterEntry;
};

/**
 * Add a driver to tonight's sheet.
 *
 * seq is a sort key, not the row number: max+1 so two drivers can never share
 * one, even after a removal. What appears in the `#` column is the position in
 * the list, which stays contiguous no matter what has been removed.
 */
export async function addEntry(
  nightKey: string,
  existing: Entry[],
  input: NewEntry,
  updatedBy: string,
) {
  const seq = existing.reduce((highest, entry) => Math.max(highest, entry.seq), 0) + 1;

  await addDoc(entriesCollection(nightKey), {
    seq,
    driverId: input.driverId,
    fullName: input.fullName,
    isBud: input.roster?.isBud === true,
    isTrainer: input.roster?.isTrainer === true,
    isRescuer: input.roster?.isRescuer === true,

    eta: input.eta,
    returnsRaw: input.returnsRaw,
    returnsCount: input.returnsCount,
    returnsReasons: input.returnsReasons,
    returnsMismatch: input.returnsMismatch,
    performance: input.performance,
    metric: input.metric,
    infractions: input.infractions,
    rescues: input.rescues,
    notes: input.notes,
    clockOutManual: input.clockOutManual,

    // The closer's half, initialised so their list has something to sort and
    // render before anyone has arrived. A driver the dispatcher already clocked
    // out arrives here as 'clockedOut' — Karim sees him done, not waiting.
    status: input.status,
    clockOut: null,
    van: "",
    vanIssues: "",
    grounded: false,
    fuel: null,
    key: null,
    charger: null,
    mobile: null,
    snack: null,
    lights: null,
    addedByCloser: false,

    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * Edit the dispatcher's half of an entry.
 *
 * The parameter type is what keeps this honest: the rules reject a write that
 * touches a closer-owned field, so the type refuses to build one.
 */
export async function updateEntry(
  nightKey: string,
  entryId: string,
  fields: Partial<EntryDispatchFields>,
  updatedBy: string,
) {
  await updateDoc(doc(entriesCollection(nightKey), entryId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Remove a row typed by mistake. Only the dispatcher has this, and only here. */
export async function removeEntry(nightKey: string, entryId: string) {
  await deleteDoc(doc(entriesCollection(nightKey), entryId));
}
