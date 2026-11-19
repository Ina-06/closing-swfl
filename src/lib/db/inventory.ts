"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import type { InventoryItem } from "@/lib/types";

/**
 * The MT inventory: parts kept on site and how many of each.
 *
 * Top-level and permanent. The Repairs login and the closer own the list — they add
 * items, rename them, set the minimum and remove them. The MT team counts: the
 * only thing their login can change is the quantity, and firestore.rules holds
 * that line whatever their screen does.
 */

const COLLECTION = "inventory";

function inventoryCollection() {
  return collection(getDb(), COLLECTION);
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function toItem(data: DocumentData, id: string): InventoryItem {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    quantity: count(data.quantity),
    minQuantity: count(data.minQuantity),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
  };
}

/** Alphabetical, so a row never jumps while somebody is counting it. */
function byName(a: InventoryItem, b: InventoryItem): number {
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function isLow(item: InventoryItem): boolean {
  return item.quantity < item.minQuantity;
}

/** The whole inventory, live. */
export function useInventory() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      inventoryCollection(),
      (snapshot) => {
        setItems(
          snapshot.docs
            .map((document) => toItem(document.data(), document.id))
            .sort(byName),
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

export type InventoryFields = Pick<InventoryItem, "name" | "quantity" | "minQuantity">;

function clean(fields: InventoryFields) {
  const name = fields.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("The item needs a name.");
  return {
    name,
    quantity: count(fields.quantity),
    minQuantity: count(fields.minQuantity),
  };
}

/** Repairs login and the closer only. */
export async function addItem(fields: InventoryFields, updatedBy: string) {
  await addDoc(inventoryCollection(), {
    ...clean(fields),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Repairs login and the closer only — name, quantity and minimum together. */
export async function editItem(
  id: string,
  fields: InventoryFields,
  updatedBy: string,
) {
  await updateDoc(doc(inventoryCollection(), id), {
    ...clean(fields),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** A count. The one write the MT team can make. */
export async function setQuantity(id: string, quantity: number, updatedBy: string) {
  await updateDoc(doc(inventoryCollection(), id), {
    quantity: count(quantity),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * One more or one fewer. Applied by the server, so two people tapping the
 * same item at once both count rather than one overwriting the other.
 */
export async function stepQuantity(id: string, by: 1 | -1, updatedBy: string) {
  await updateDoc(doc(inventoryCollection(), id), {
    quantity: increment(by),
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Repairs login and the closer only. */
export async function removeItem(id: string) {
  await deleteDoc(doc(inventoryCollection(), id));
}
