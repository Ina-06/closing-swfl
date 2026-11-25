"use client";

import { useState } from "react";
import { Inventory } from "@/components/repairs/Inventory";
import { ErrorNote } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useInventory } from "@/lib/db/inventory";

/**
 * The MT team counts. Every item is listed with its minimum; the only thing
 * they can change is how many are on the shelf. Adding, renaming and removing
 * items is done from the Repairs side — and firestore.rules, not this screen,
 * is what holds that line.
 */
export default function MtPage() {
  const auth = useAuth();
  const uid = auth.status === "signedIn" ? auth.uid : "";
  const inventory = useInventory();
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Count the shelf</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Update each quantity to what is actually on site. Red means it is
          below the minimum.
        </p>
      </div>

      {inventory.error ? (
        <ErrorNote>
          Could not read the inventory: {inventory.error}. If this says
          permission denied, the Firestore rules may not be published yet.
        </ErrorNote>
      ) : null}
      {failure ? <ErrorNote>{failure}</ErrorNote> : null}

      <Inventory
        items={inventory.items}
        loading={inventory.loading}
        mode="countOnly"
        uid={uid}
        onError={setFailure}
      />
    </div>
  );
}
