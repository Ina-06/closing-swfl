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
function toEntry(data: DocumentData, id: string): Entry {
  const string = (value: unknown) => (typeof value === "string" ? value : "");

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

    status: data.status === "arrived" ? "arrived" : "enroute",
    clockOut: data.clockOut ?? null,
    van: string(data.van),
    vanIssues: string(data.vanIssues),
    cell: typeof data.cell === "boolean" ? data.cell : null,
    key: typeof data.key === "boolean" ? data.key : null,
    fuel: typeof data.fuel === "boolean" ? data.fuel : null,
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
      (result) => {
        setSnapshot({
          key: nightKey,
          entries: result.docs.map((document) =>
            toEntry(document.data(), document.id),
          ),
        });
        setError(null);
      },
      (snapshotError) => {
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
    // out arrives here as 'arrived' — Karim sees him done, not waiting.
    status: input.status,
    clockOut: null,
    van: "",
    vanIssues: "",
    cell: null,
    key: null,
    fuel: null,
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
