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
import { getDb } from "@/lib/firebase/client";
import { nameKey } from "@/lib/names";
import type { Driver } from "@/lib/types";

const COLLECTION = "drivers";

function driversQuery() {
  return query(collection(getDb(), COLLECTION), orderBy("fullName"));
}

/**
 * The whole roster, live.
 *
 * A station has tens of drivers, not thousands, so we hold all of them and do
 * matching in memory. That keeps the paste box instant and works offline once
 * Phase 9 turns on persistence.
 */
export function useDrivers() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      driversQuery(),
      (snapshot) => {
        setDrivers(
          snapshot.docs.map((document) => {
            const data = document.data();
            const fullName = typeof data.fullName === "string" ? data.fullName : "";
            return {
              id: document.id,
              fullName,
              nameKey:
                typeof data.nameKey === "string" ? data.nameKey : nameKey(fullName),
              createdAt: data.createdAt ?? null,
            };
          }),
        );
        setError(null);
      },
      (snapshotError) => setError(snapshotError.message),
    );
  }, []);

  return { drivers, error, loading: drivers === null };
}

/**
 * The driver record holds a name and nothing else.
 *
 * BUD, TRN and RES describe a night rather than a person, so they live on the
 * session roster where they are set — not here.
 */
export async function addDriver(fullName: string): Promise<string> {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("A driver needs a name.");

  const created = await addDoc(collection(getDb(), COLLECTION), {
    fullName: trimmed,
    nameKey: nameKey(trimmed),
    createdAt: serverTimestamp(),
  });

  return created.id;
}

export async function renameDriver(id: string, fullName: string) {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("A driver needs a name.");

  // Sheets already written keep the name they were written with — the session
  // roster and every entry carry their own copy. This only affects nights from
  // here on.
  await updateDoc(doc(getDb(), COLLECTION, id), {
    fullName: trimmed,
    nameKey: nameKey(trimmed),
  });
}

/**
 * Remove a driver from the database for good.
 *
 * Safe precisely because names are denormalised: past sessions and their
 * entries hold their own copy of the full name, so a closed sheet reads
 * exactly the same after the driver is gone. Sessions themselves are still
 * never deletable.
 */
export async function deleteDriver(id: string) {
  await deleteDoc(doc(getDb(), COLLECTION, id));
}

