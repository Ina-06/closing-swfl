"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import {
  cleanVan,
  matchKeyFor,
  unseenRepairs,
  type NewRepair,
} from "@/lib/repairs";
import type { RepairTask } from "@/lib/types";

/**
 * The repairs board's reads and writes.
 *
 * A top-level collection rather than something under a session, because a
 * repair is not part of a night. It is opened on one and closed on another,
 * and hanging it off the night it came from would mean the board could only be
 * assembled by reading every session there has ever been.
 */

const COLLECTION = "repairs";

/**
 * How far back the board looks.
 *
 * Everything — open, done and archived — comes down one listener, which is
 * what lets the three tabs be a filter over one list rather than three queries
 * that can disagree with each other. It also means the whole board needs no
 * composite index at all: one collection, one sort, no `where`.
 *
 * Five hundred is years of a station this size. The board says so when it is
 * full rather than quietly dropping the oldest, because a to-do list that
 * loses items is worse than one that admits it is long.
 */
const MAX_TASKS = 500;

function repairsCollection() {
  return collection(getDb(), COLLECTION);
}

/**
 * Read a task defensively, the same way entries and sessions are read.
 *
 * Firestore hands back a local snapshot the instant a write is queued, so a
 * half-written document is something every screen can see. Every field gets a
 * default rather than being trusted.
 *
 * `matchKey` is recomputed when it is missing so a task written by hand
 * straight into the console still takes part in de-duplication rather than
 * silently being the one fault that gets posted every night.
 */
function toTask(data: DocumentData, id: string): RepairTask {
  const string = (value: unknown) => (typeof value === "string" ? value : "");
  const title = string(data.title);
  const van = string(data.van);

  return {
    id,
    title,
    van,
    detail: string(data.detail),
    grounded: data.grounded === true,
    source: data.source === "endDay" ? "endDay" : "manual",
    nightKey: string(data.nightKey),
    driverName: string(data.driverName),
    matchKey: string(data.matchKey) || matchKeyFor(van, title),
    done: data.done === true,
    doneAt: data.doneAt ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    updatedBy: string(data.updatedBy),
  };
}

/**
 * The whole board, live.
 *
 * Ordered newest first in the query purely to bound which five hundred come
 * down; the board sorts what it gets for itself, because a task whose
 * `createdAt` has not reached the server yet has no place in a server-side
 * sort and would sit at the bottom of the list for the second it takes to
 * settle. See byUrgency.
 */
export function useRepairs() {
  const [tasks, setTasks] = useState<RepairTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(repairsCollection(), orderBy("createdAt", "desc"), limit(MAX_TASKS)),
      (snapshot) => {
        setTasks(
          snapshot.docs.map((document) =>
            /**
             * The same "estimate" the entries listener uses, and for the same
             * reason: `doneAt` is a server timestamp, and the countdown to the
             * archive is rendered off it. Without the estimate a task ticked
             * off a second ago has no stamp, and the line under it would read
             * as though the clock had not started.
             */
            toTask(document.data({ serverTimestamps: "estimate" }), document.id),
          ),
        );
        setError(null);
      },
      (snapshotError) => {
        setTasks([]);
        setError(snapshotError.message);
      },
    );
  }, []);

  return {
    tasks: tasks ?? [],
    loading: tasks === null,
    /** True while the listener is returning everything it is allowed to. */
    capped: (tasks?.length ?? 0) >= MAX_TASKS,
    error,
  };
}

/** The shape every write puts on a new document. */
function taskFields(input: NewRepair, updatedBy: string) {
  return {
    title: input.title,
    van: input.van,
    detail: "",
    grounded: input.grounded,
    source: input.source,
    nightKey: input.nightKey,
    driverName: input.driverName,
    matchKey: input.matchKey,
    done: false,
    doneAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  };
}

/** A task typed on the board. Returns its id so the list can settle on it. */
export async function addRepair(
  input: NewRepair,
  updatedBy: string,
): Promise<string> {
  const created = await addDoc(repairsCollection(), taskFields(input, updatedBy));
  return created.id;
}

/**
 * End Day's write: tonight's van issues, minus whatever is already on the board.
 *
 * The board is read here rather than passed in, because the screen that calls
 * this is the closer's phone and it has no repairs listener open — it has no
 * business having one. One read, one batch, and the count of what was actually
 * posted comes back so Karim can be told.
 *
 * Deliberately not a transaction. Two people ending the same night at the same
 * second is not a thing that happens — there is one closer, on one phone, in
 * one yard — and the cost of getting it wrong is a duplicate line on a to-do
 * list, which anybody can tick off. The cost of a transaction failing at that
 * moment is Karim staring at an error on the last thing he does all night.
 */
export async function pushRepairs(
  candidates: NewRepair[],
  updatedBy: string,
): Promise<number> {
  if (candidates.length === 0) return 0;

  const snapshot = await getDocs(
    query(repairsCollection(), orderBy("createdAt", "desc"), limit(MAX_TASKS)),
  );
  const existing = snapshot.docs.map((document) =>
    toTask(document.data(), document.id),
  );

  const fresh = unseenRepairs(candidates, existing);
  if (fresh.length === 0) return 0;

  const batch = writeBatch(getDb());
  for (const task of fresh) {
    batch.set(doc(repairsCollection()), taskFields(task, updatedBy));
  }
  await batch.commit();

  return fresh.length;
}

/**
 * Tick a task off, or put it back.
 *
 * `doneAt` is stamped by the server and cleared on the way back, so a task
 * ticked off by mistake and un-ticked does not carry a month-old archive clock
 * around with it.
 */
export async function setRepairDone(
  taskId: string,
  done: boolean,
  updatedBy: string,
) {
  await updateDoc(doc(repairsCollection(), taskId), {
    done,
    doneAt: done ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * Correct what a task says.
 *
 * `matchKey` is rewritten alongside the text, never left behind. It is derived
 * from the van and the title, and a task whose key still describes what it
 * used to say is a task that will quietly block the wrong fault from being
 * posted a month later.
 */
export async function editRepair(
  taskId: string,
  fields: { title: string; van: string; detail: string; grounded: boolean },
  updatedBy: string,
) {
  // The same cleaning a new job gets. A van corrected to "VAN 150" here would
  // otherwise render as "Van VAN 150" on the row, and would stop matching the
  // job End Day posts for the same van tomorrow.
  const van = cleanVan(fields.van);

  await updateDoc(doc(repairsCollection(), taskId), {
    ...fields,
    van,
    matchKey: matchKeyFor(van, fields.title),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * Remove a task outright.
 *
 * The one delete in this half of the app, and it is here for the same reason
 * the dispatcher has one on entries: a line typed by mistake. Ticking a task
 * off means the van was seen to; deleting it means it should never have been
 * asked for, and a board that cannot say that accumulates lies. The board asks
 * twice before it calls this.
 */
export async function removeRepair(taskId: string) {
  await deleteDoc(doc(repairsCollection(), taskId));
}
