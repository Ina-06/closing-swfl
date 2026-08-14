"use client";

import { CloserBoard, Empty } from "@/components/closer/CloserBoard";
import { ErrorNote } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTonightSession } from "@/lib/db/sessions";

export default function CloserPage() {
  const auth = useAuth();
  const { nightKey, session, loading, error } = useTonightSession();

  if (error) {
    return (
      <ErrorNote>
        Could not reach tonight&rsquo;s sheet: {error}. If this says permission
        denied, the Firestore rules may not be published yet.
      </ErrorNote>
    );
  }

  if (loading || !nightKey) {
    return (
      <div
        className="h-64 animate-pulse rounded-xl border border-line bg-surface"
        aria-busy="true"
        aria-label="Loading tonight's sheet"
      />
    );
  }

  if (!session) {
    return (
      <Empty
        title="Tonight hasn't started"
        blurb="Dispatch pastes the roster to open the night. This screen fills itself in as soon as that happens — no need to refresh."
      />
    );
  }

  return (
    <CloserBoard
      nightKey={nightKey}
      session={session}
      uid={auth.status === "signedIn" ? auth.uid : ""}
    />
  );
}
