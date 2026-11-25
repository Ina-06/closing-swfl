"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { vendorKey } from "@/lib/registration";

/**
 * Who the registration reminders go to — typed in the app by the Repairs
 * login, read by the daily job in lib/server/registrationReminders.ts.
 *
 *   vendorContacts/{id}             one vendor: its name and its addresses.
 *                                   Matched to a van by the vans database's
 *                                   Vendor column, ignoring case and spaces.
 *   emailSettings/registration      `team`: the SWFL addresses that get every
 *                                   reminder for every van.
 *
 * Repairs only, both ways — see firestore.rules.
 */

export type VendorContact = {
  id: string;
  name: string;
  key: string;
  emails: string[];
};

const VENDORS = "vendorContacts";
const SETTINGS = "emailSettings";
const REGISTRATION = "registration";

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function useVendorContacts() {
  const [vendors, setVendors] = useState<VendorContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      collection(getDb(), VENDORS),
      (snapshot) => {
        setVendors(
          snapshot.docs
            .map((document) => {
              const data = document.data();
              const name = typeof data.name === "string" ? data.name : "";
              return { id: document.id, name, key: vendorKey(name), emails: strings(data.emails) };
            })
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
        );
        setError(null);
      },
      (snapshotError) => {
        setVendors([]);
        setError(snapshotError.message);
      },
    );
  }, []);

  return { vendors: vendors ?? [], loading: vendors === null, error };
}

export function useRegistrationTeam() {
  const [team, setTeam] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(getDb(), SETTINGS, REGISTRATION),
      (snapshot) => {
        setTeam(strings(snapshot.data()?.team));
        setError(null);
      },
      (snapshotError) => {
        setTeam([]);
        setError(snapshotError.message);
      },
    );
  }, []);

  return { team: team ?? [], loading: team === null, error };
}

function vendorFields(name: string, emails: string[]) {
  const tidy = name.trim().replace(/\s+/g, " ");
  if (!tidy) throw new Error("It needs a vendor name.");
  return { name: tidy, key: vendorKey(tidy), emails };
}

export async function addVendorContact(name: string, emails: string[], updatedBy: string) {
  await addDoc(collection(getDb(), VENDORS), {
    ...vendorFields(name, emails),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function editVendorContact(
  id: string,
  name: string,
  emails: string[],
  updatedBy: string,
) {
  await updateDoc(doc(getDb(), VENDORS, id), {
    ...vendorFields(name, emails),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function removeVendorContact(id: string) {
  await deleteDoc(doc(getDb(), VENDORS, id));
}

/** Merged, so the first address ever added creates the document. */
export async function addTeamEmails(emails: string[], updatedBy: string) {
  await setDoc(
    doc(getDb(), SETTINGS, REGISTRATION),
    { team: arrayUnion(...emails), updatedAt: serverTimestamp(), updatedBy },
    { merge: true },
  );
}

export async function removeTeamEmail(email: string, updatedBy: string) {
  await setDoc(
    doc(getDb(), SETTINGS, REGISTRATION),
    { team: arrayRemove(email), updatedAt: serverTimestamp(), updatedBy },
    { merge: true },
  );
}
