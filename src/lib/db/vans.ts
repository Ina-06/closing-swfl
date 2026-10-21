"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { vanKey, vanNumber } from "@/lib/vans";
import type { VanRecord } from "@/lib/types";

/**
 * The station's vans database: van number, vendor, VIN and vendor number.
 *
 * Top-level and permanent — a van is in it until somebody removes it on
 * purpose. Written from the Repairs login only; read by the repairs board,
 * where every job card looks its van up here.
 */

const COLLECTION = "vans";

function vansCollection() {
  return collection(getDb(), COLLECTION);
}

function toVan(data: DocumentData, id: string): VanRecord {
  const string = (value: unknown) => (typeof value === "string" ? value : "");
  const van = string(data.van);

  return {
    id,
    van,
    vendor: string(data.vendor),
    vin: string(data.vin),
    vendorNumber: string(data.vendorNumber),
    // Recomputed rather than trusted, so a change to what counts as the same
    // van applies to every van already in the database.
    key: vanKey(van),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    updatedBy: string(data.updatedBy),
  };
}

/** Natural order, so BR.7 comes before BR.214. */
function byVan(a: VanRecord, b: VanRecord): number {
  return a.van.localeCompare(b.van, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** The whole database, live. A station has tens of vans, so all of it. */
export function useVans() {
  const [vans, setVans] = useState<VanRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      vansCollection(),
      (snapshot) => {
        setVans(
          snapshot.docs
            .map((document) => toVan(document.data(), document.id))
            .sort(byVan),
        );
        setError(null);
      },
      (snapshotError) => {
        setVans([]);
        setError(snapshotError.message);
      },
    );
  }, []);

  /**
   * Each van by its key, for the job cards. The first one wins if a van is in
   * twice — the database tab says so when it is.
   */
  const byKey = useMemo(() => {
    const map = new Map<string, VanRecord>();
    for (const van of vans ?? []) {
      if (van.key && !map.has(van.key)) map.set(van.key, van);
    }
    return map;
  }, [vans]);

  /** Each van by its number alone, for a job written "112" — see findVan. */
  const byNumber = useMemo(() => {
    const map = new Map<string, VanRecord[]>();
    for (const van of vans ?? []) {
      const number = vanNumber(van.key);
      if (!number) continue;
      map.set(number, [...(map.get(number) ?? []), van]);
    }
    return map;
  }, [vans]);

  return { vans: vans ?? [], byKey, byNumber, loading: vans === null, error };
}

/** What a van is written as: the four fields, trimmed. */
export type VanFields = Pick<VanRecord, "van" | "vendor" | "vin" | "vendorNumber">;

function clean(fields: VanFields) {
  const tidy = (value: string) => value.trim().replace(/\s+/g, " ");
  const van = tidy(fields.van);
  if (!van) throw new Error("It needs a van number.");
  return {
    van,
    vendor: tidy(fields.vendor),
    // A VIN has no spaces in it and is always read out in capitals.
    vin: fields.vin.replace(/\s+/g, "").toUpperCase(),
    vendorNumber: tidy(fields.vendorNumber),
    key: vanKey(van),
  };
}

export async function addVan(fields: VanFields, updatedBy: string) {
  await addDoc(vansCollection(), {
    ...clean(fields),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function editVan(id: string, fields: VanFields, updatedBy: string) {
  await updateDoc(doc(vansCollection(), id), {
    ...clean(fields),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function removeVan(id: string) {
  await deleteDoc(doc(vansCollection(), id));
}
