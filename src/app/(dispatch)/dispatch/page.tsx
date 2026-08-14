"use client";

import { useState } from "react";
import { RosterSetup } from "@/components/dispatch/RosterSetup";
import { SessionSummary } from "@/components/dispatch/SessionSummary";
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
      <SessionSummary
        session={session}
        nightKey={nightKey}
        onEditRoster={() => setEditingRoster(true)}
      />
    );
  }

  return (
    <RosterSetup
      nightKey={nightKey}
      drivers={drivers}
      uid={uid}
      existing={editingRoster && session ? session : undefined}
      onDone={() => setEditingRoster(false)}
      onCancel={editingRoster ? () => setEditingRoster(false) : undefined}
    />
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
