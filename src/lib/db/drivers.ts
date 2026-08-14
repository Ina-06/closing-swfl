"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
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
            return {
              id: document.id,
              fullName: data.fullName ?? "",
              nameKey: data.nameKey ?? nameKey(data.fullName ?? ""),
              active: data.active !== false,
              isBudDefault: data.isBudDefault === true,
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

export async function addDriver(
  fullName: string,
  options: { isBudDefault?: boolean } = {},
): Promise<string> {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("A driver needs a name.");

  const created = await addDoc(collection(getDb(), COLLECTION), {
    fullName: trimmed,
    nameKey: nameKey(trimmed),
    active: true,
    isBudDefault: options.isBudDefault === true,
    createdAt: serverTimestamp(),
  });

  return created.id;
}

export async function renameDriver(id: string, fullName: string) {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("A driver needs a name.");

  // Sheets already written keep the name they were written with — entries
  // carry their own copy of fullName. This only affects nights from here on.
  await updateDoc(doc(getDb(), COLLECTION, id), {
    fullName: trimmed,
    nameKey: nameKey(trimmed),
  });
}

/** Drivers are deactivated, never deleted — old sheets still refer to them. */
export async function setDriverActive(id: string, active: boolean) {
  await updateDoc(doc(getDb(), COLLECTION, id), { active });
}

export async function setDriverBudDefault(id: string, isBudDefault: boolean) {
  await updateDoc(doc(getDb(), COLLECTION, id), { isBudDefault });
}
