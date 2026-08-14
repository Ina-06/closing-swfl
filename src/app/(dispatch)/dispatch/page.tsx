"use client";

import { useState } from "react";
import { RosterSetup } from "@/components/dispatch/RosterSetup";
import { TonightBoard } from "@/components/dispatch/TonightBoard";
import { ErrorNote } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDrivers } from "@/lib/db/drivers";
import { useTonightSession } from "@/lib/db/sessions";

export default function DispatchPage() {
  const auth = useAuth();
  const { drivers, loading: driversLoading, error: driversError } = useDrivers();
  const { nightKey, session, loading: sessionLoading, error: sessionError } =
    useTonightSession();
  const [editingRoster, setEditingRoster] = useState(false);

  const uid = auth.status === "signedIn" ? auth.uid : "";
  const error = driversError ?? sessionError;

  if (error) {
    return (
      <ErrorNote>
        Could not reach the database: {error}. If this says permission denied,
        the Firestore rules may not be published yet.
      </ErrorNote>
    );
  }

  if (driversLoading || sessionLoading || !nightKey || !drivers) {
    return <LoadingPanel />;
  }

  if (session && !editingRoster) {
    return (
      <TonightBoard
        nightKey={nightKey}
        session={session}
        drivers={drivers}
        uid={uid}
        onEditRoster={() => setEditingRoster(true)}
      />
    );
  }

  // The roster is a column of names — it does not want the full width the
  // live sheet needs.
  return (
    <div className="max-w-4xl">
      <RosterSetup
        nightKey={nightKey}
        drivers={drivers}
        uid={uid}
        existing={editingRoster && session ? session : undefined}
        onDone={() => setEditingRoster(false)}
        onCancel={editingRoster ? () => setEditingRoster(false) : undefined}
      />
    </div>
  );
}

function LoadingPanel() {
  return (
    <div
      className="h-64 animate-pulse rounded-xl border border-line bg-surface"
      aria-busy="true"
      aria-label="Loading tonight's roster"
    />
  );
}
