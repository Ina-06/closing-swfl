"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import {
  FIRST_ROUND,
  closedMarker,
  markerOnStart,
  type RoundMarker,
} from "@/lib/fleetRound";
import type { FleetItem, FleetKind } from "@/lib/types";

/**
 * Today's available vans and gas cards — a list Issam types, and the closer
 * and Issam tick off as they go out.
 *
 * Top-level, beside the repairs board, because the list is read from both
 * sides of the door: the board, where it is written, and the closer's screen,
 * where a van switch at nine o'clock is the moment somebody needs it.
 *
 * Each line belongs to a round, and the round is the session. One small
 * document — `fleetMeta/round` — names the round that is current; a new line
 * is stamped with it, and only lines of the current round are read. Moving
 * the round on is therefore what empties the list, without deleting a line
 * and without touching anything on the repairs board. See endFleetRound and
 * startFleetRound for when it moves.
 */

const COLLECTION = "fleet";

function fleetCollection() {
  return collection(getDb(), COLLECTION);
}

function roundDoc() {
  return doc(getDb(), "fleetMeta", "round");
}

function toItem(data: DocumentData, id: string): FleetItem {
  const string = (value: unknown) => (typeof value === "string" ? value : "");

  return {
    id,
    // A line from before the lists were split has no kind; the vans list is
    // where it was most likely meant to be.
    kind: data.kind === "gasCard" ? "gasCard" : "van",
    label: string(data.label),
    round: string(data.round),
    used: data.used === true,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    updatedBy: string(data.updatedBy),
  };
}

/** Natural order, so BR.7 comes before BR.214 — the same as the job list. */
function byLabel(a: FleetItem, b: FleetItem): number {
  return a.label.localeCompare(b.label, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * This round's list, live. Waits for the round to be known — `null` — rather
 * than briefly showing an earlier day's lines.
 */
export function useFleet(round: string | null) {
  const [state, setState] = useState<{
    round: string;
    items: FleetItem[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (round === null) return;
    return onSnapshot(
      query(fleetCollection(), where("round", "==", round)),
      (snapshot) => {
        setState({
          round,
          items: snapshot.docs
            .map((document) => toItem(document.data(), document.id))
            .sort(byLabel),
        });
        setError(null);
      },
      (snapshotError) => {
        setState({ round, items: [] });
        setError(snapshotError.message);
      },
    );
  }, [round]);

  // A list fetched for a round that has since moved on is not this list.
  const current = state !== null && state.round === round ? state : null;
  return { items: current?.items ?? [], loading: current === null, error };
}

/**
 * Which round is current, live.
 *
 * Live rather than read once, so the list on an office laptop empties itself
 * the moment Karim ends the day in the yard, without a refresh.
 */
export function useFleetRound() {
  const [round, setRound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      roundDoc(),
      (snapshot) => {
        const value = snapshot.data()?.round;
        setRound(typeof value === "string" && value ? value : FIRST_ROUND);
        setError(null);
      },
      (snapshotError) => {
        setRound(null);
        setError(snapshotError.message);
      },
    );
  }, []);

  return { round, loading: round === null && error === null, error };
}

/**
 * Today's list, from one hook: the round, then that round's lines.
 *
 * `round` is null until it is known, and nothing can be added before then —
 * a line stamped with a guessed round could land on yesterday's list.
 */
export function useAvailable() {
  const marker = useFleetRound();
  const list = useFleet(marker.round);
  return {
    round: marker.round,
    items: list.items,
    loading: marker.loading || (marker.round !== null && list.loading),
    error: marker.error ?? list.error,
  };
}

/** A line on today's vans list or gas cards list. */
export async function addFleetItem(
  kind: FleetKind,
  label: string,
  round: string,
  updatedBy: string,
) {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("It needs a number.");

  await addDoc(fleetCollection(), {
    kind,
    label: trimmed,
    round,
    used: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Tick it off as used, or put it back. */
export async function setFleetUsed(
  id: string,
  used: boolean,
  updatedBy: string,
) {
  await updateDoc(doc(fleetCollection(), id), {
    used,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Take a line typed by mistake off the list. */
/** Correct what a line says — a van or card typed wrong. */
export async function renameFleetItem(
  id: string,
  label: string,
  updatedBy: string,
) {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("It needs a number.");

  await updateDoc(doc(fleetCollection(), id), {
    label: trimmed,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function removeFleetItem(id: string) {
  await deleteDoc(doc(fleetCollection(), id));
}

/**
 * End Day: the list of available vans and cards empties.
 *
 * Called from closeSession, so it happens however the night is ended. One
 * write to the round document and nothing else — no line is deleted, and
 * nothing on the repairs board is touched.
 */
export async function endFleetRound(nightKey: string, updatedBy: string) {
  await setDoc(roundDoc(), {
    ...closedMarker(nightKey),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * The dispatcher starts a new day: empty the list if End Day never did.
 *
 * If Karim ended the last day the list is already empty, and anything written
 * since — Issam typing up the spares before the roster was posted — belongs to
 * today and survives this. See markerOnStart for the whole rule.
 */
export async function startFleetRound(nightKey: string, updatedBy: string) {
  const data = (await getDoc(roundDoc())).data();
  const current: RoundMarker | undefined =
    typeof data?.round === "string" && data.round
      ? {
          round: data.round,
          night: typeof data.night === "string" ? data.night : null,
        }
      : undefined;

  const next = markerOnStart(current, nightKey);
  if (next === null) return;

  await setDoc(roundDoc(), {
    ...next,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}
