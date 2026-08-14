"use client";

import { Timestamp, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";

/**
 * The closer's writes.
 *
 * Deliberately three named actions rather than one generic update: everything
 * on this side is a physical event in the yard, and the rules only accept the
 * closer's own columns. A function that could touch an ETA would be a function
 * the rules reject at the door.
 */

function entryRef(nightKey: string, entryId: string) {
  return doc(getDb(), "sessions", nightKey, "entries", entryId);
}

/**
 * The van pulled in.
 *
 * The time comes from the server, not the phone. A clock-out settles arguments
 * about whether someone made the cutoff, so it must not be whatever a phone
 * with the wrong time thinks it is.
 */
export async function markArrived(
  nightKey: string,
  entryId: string,
  updatedBy: string,
) {
  await updateDoc(entryRef(nightKey, entryId), {
    status: "arrived",
    clockOut: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * Correct a stamped time.
 *
 * He tapped Arrived five minutes after the van actually parked, or stamped one
 * driver while meaning another. The corrected value is a real instant built
 * from the station's clock — see stationInstant — never a string.
 */
export async function correctClockOut(
  nightKey: string,
  entryId: string,
  at: Date,
  updatedBy: string,
) {
  await updateDoc(entryRef(nightKey, entryId), {
    status: "arrived",
    clockOut: Timestamp.fromDate(at),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Stamped the wrong driver. Puts him back on the waiting list, unstamped. */
export async function reopenEntry(
  nightKey: string,
  entryId: string,
  updatedBy: string,
) {
  await updateDoc(entryRef(nightKey, entryId), {
    status: "enroute",
    clockOut: null,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}
