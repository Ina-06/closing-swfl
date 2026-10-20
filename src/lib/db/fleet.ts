"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import {
  FIRST_ROUND,
  closedMarker,
  markerOnStart,
  usedInRound,
  type RoundMarker,
} from "@/lib/fleetRound";
import type { FleetItem, FleetKind } from "@/lib/types";

/**
 * The station's vans and gas cards, and which of them went out this session.
 *
 * Top-level, beside the repairs board it is shown on, for the same reason the
 * board is: it is the station's, not any one night's. A van exists whether or
 * not anybody drove it tonight, so adding one writes a document here that
 * stays until somebody removes it on purpose.
 *
 * "Used" means used in the current round, and the round is the session. One
 * small document — `fleetMeta/round` — names the round that is current; a tick
 * writes that name onto the van, and a van is used when the two match. Moving
 * the round on is therefore what clears every tick at once, without touching a
 * single van, a single card, or anything on the repairs board. See
 * endFleetRound and startFleetRound for when it moves.
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
    kind: data.kind === "gasCard" ? "gasCard" : "van",
    label: string(data.label),
    usedOn: string(data.usedOn),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    updatedBy: string(data.updatedBy),
  };
}

/** The whole list, live. A station has tens of each, so all of it comes down. */
export function useFleet() {
  const [items, setItems] = useState<FleetItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      fleetCollection(),
      (snapshot) => {
        setItems(
          snapshot.docs.map((document) => toItem(document.data(), document.id)),
        );
        setError(null);
      },
      (snapshotError) => {
        setItems([]);
        setError(snapshotError.message);
      },
    );
  }, []);

  return { items: items ?? [], loading: items === null, error };
}

/**
 * Which round of ticks is current, live.
 *
 * Live rather than read once, so the repairs board on an office laptop clears
 * itself the moment Karim ends the day in the yard, without a refresh.
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
        setRound(FIRST_ROUND);
        setError(snapshotError.message);
      },
    );
  }, []);

  return { round: round ?? FIRST_ROUND, loading: round === null, error };
}

/** Whether this van or card has been ticked off in the current round. */
export function usedThisRound(item: FleetItem, round: string): boolean {
  return usedInRound(item.usedOn, round);
}

export async function addFleetItem(
  kind: FleetKind,
  label: string,
  updatedBy: string,
) {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("It needs a number.");

  await addDoc(fleetCollection(), {
    kind,
    label: trimmed,
    usedOn: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Tick it as used this round, or put it back to spare. */
export async function setFleetUsed(
  id: string,
  used: boolean,
  round: string,
  updatedBy: string,
) {
  await updateDoc(doc(fleetCollection(), id), {
    usedOn: used ? round : "",
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Take a van that has gone, or a card that was cancelled, off the list. */
export async function removeFleetItem(id: string) {
  await deleteDoc(doc(fleetCollection(), id));
}

/**
 * End Day: every van and card is spare again.
 *
 * Called from closeSession, so it happens however the night is ended. One
 * write to the round document and nothing else — no van is touched, no card,
 * and nothing on the repairs board.
 */
export async function endFleetRound(nightKey: string, updatedBy: string) {
  await setDoc(roundDoc(), {
    ...closedMarker(nightKey),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * The dispatcher starts a new day: clear the ticks if End Day never did.
 *
 * If Karim ended the last day the list is already clear, and anything ticked
 * since — Issam getting to the vans before the roster was posted — belongs to
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
