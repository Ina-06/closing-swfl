"use client";

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import type { Entry, EntryChecks, RosterEntry } from "@/lib/types";

/**
 * The closer's writes.
 *
 * Deliberately a handful of named actions rather than one generic update:
 * everything on this side is a physical event in the yard, and the rules only
 * accept the closer's own columns. A function that could touch an ETA would be
 * a function the rules reject at the door.
 */

function entriesCollection(nightKey: string) {
  return collection(getDb(), "sessions", nightKey, "entries");
}

function entryRef(nightKey: string, entryId: string) {
  return doc(getDb(), "sessions", nightKey, "entries", entryId);
}

/**
 * The van pulled in and the driver is standing there.
 *
 * No time is written here. Arriving and being finished with are two different
 * moments — Karim still has the fuel, the key, the charger, the phone, the
 * snack, the lights and whatever is wrong with the van to get through — and
 * stamping on the first of them would put a clock-out on the record several
 * minutes before the handover it is supposed to be recording.
 */
export async function markArrived(
  nightKey: string,
  entryId: string,
  updatedBy: string,
) {
  await updateDoc(entryRef(nightKey, entryId), {
    status: "arrived",
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * The handover is done. This is the clock-out.
 *
 * The time comes from the server, not the phone. A clock-out settles arguments
 * about whether someone made the cutoff, so it must not be whatever a phone
 * with the wrong time thinks it is.
 */
export async function clockOut(
  nightKey: string,
  entryId: string,
  updatedBy: string,
) {
  await updateDoc(entryRef(nightKey, entryId), {
    status: "clockedOut",
    clockOut: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * Correct a stamped time.
 *
 * He clocked the driver out five minutes after they actually finished, or
 * clocked one out while meaning another. The corrected value is a real instant
 * built from the station's clock — see stationInstant — never a string.
 */
export async function correctClockOut(
  nightKey: string,
  entryId: string,
  at: Date,
  updatedBy: string,
) {
  await updateDoc(entryRef(nightKey, entryId), {
    status: "clockedOut",
    clockOut: Timestamp.fromDate(at),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Wrong driver. Puts him back on the waiting list, unstamped. */
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

/** The van itself — number, issues, and the handover checks. */
export type YardFields = Partial<
  Pick<Entry, "van" | "vanOk" | "vanIssues" | "grounded"> & EntryChecks
>;

/**
 * What Karim found when the van came in.
 *
 * Saved a field at a time as he works, not behind a Save button: he is holding
 * a phone in one hand and a set of keys in the other, and a form he has to
 * remember to submit is a form that loses a van number.
 */
export async function saveYard(
  nightKey: string,
  entryId: string,
  fields: YardFields,
  updatedBy: string,
) {
  await updateDoc(entryRef(nightKey, entryId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * A driver who turned up without being announced.
 *
 * He lands arrived, not waiting. The only way Karim knows to add someone is
 * that the van is in front of him, so adding *is* the arrival — making him tap
 * Arrived afterwards would be asking him to confirm something he just did. The
 * clock-out is still his to make at the end of the handover, same as everyone
 * else's.
 *
 * The dispatcher's half is written empty rather than omitted, so every entry
 * has the same shape however it was born. `addedByCloser` is what marks the row
 * as half-written — the dispatcher fills in the ETA and returns afterwards, and
 * until then it is flagged on both screens.
 *
 * Kept here rather than reusing addEntry: that one takes the dispatcher's
 * fields as its argument, and this side has none of them to give.
 *
 * `secondTrip` is the one variation. A driver who went back out and came in
 * again gets a row of his own rather than overwriting the first one, and that
 * row's time is typed instead of stamped — see the sheet.
 */
export async function addCloserEntry(
  nightKey: string,
  existing: Entry[],
  driver: {
    driverId: string;
    fullName: string;
    roster?: RosterEntry;
    secondTrip?: boolean;
  },
  updatedBy: string,
): Promise<string> {
  const seq =
    existing.reduce((highest, entry) => Math.max(highest, entry.seq), 0) + 1;

  const created = await addDoc(entriesCollection(nightKey), {
    seq,
    driverId: driver.driverId,
    fullName: driver.fullName,
    isBud: driver.roster?.isBud === true,
    isTrainer: driver.roster?.isTrainer === true,
    isRescuer: driver.roster?.isRescuer === true,

    eta: "",
    returnsRaw: "",
    returnsCount: null,
    returnsReasons: [],
    returnsMismatch: false,
    performance: null,
    metric: null,
    infractions: "",
    rescues: 0,
    notes: "",
    clockOutManual: "",

    // In the yard, exactly as tapping Arrived would leave him. His sheet opens
    // straight after this, on the van.
    status: "arrived",
    clockOut: null,
    van: "",
    vanOk: null,
    vanIssues: "",
    grounded: false,
    fuel: null,
    key: null,
    charger: null,
    mobile: null,
    snack: null,
    lights: null,
    bungees: null,
    addedByCloser: true,
    secondTrip: driver.secondTrip === true,

    updatedAt: serverTimestamp(),
    updatedBy,
  });

  return created.id;
}
