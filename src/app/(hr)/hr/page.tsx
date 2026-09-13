"use client";

import { TimeEditBoard } from "@/components/hr/TimeEditBoard";
import { ErrorNote } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTonightSession } from "@/lib/db/sessions";

/**
 * HR's whole portal.
 *
 * The same shape as the closer's page on purpose — resolve tonight, say
 * plainly when there is no tonight yet, otherwise hand the board the session.
 * There is nothing to set up here and nothing to create: the night belongs to
 * dispatch, and HR is a reader of it who may write one thing.
 */
export default function HrPage() {
  const auth = useAuth();
  const { nightKey, session, loading, error } = useTonightSession();

  if (error) {
    return (
      <ErrorNote>
        Could not reach tonight&rsquo;s roster: {error}. If this says permission
        denied, the Firestore rules may not be published yet.
      </ErrorNote>
    );
  }

  if (loading || !nightKey) {
    return (
      <div
        className="h-64 animate-pulse rounded-xl border border-line bg-surface"
        aria-busy="true"
        aria-label="Loading tonight's roster"
      />
    );
  }

  if (!session) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
        <p className="text-[16px] font-semibold text-ink-muted">
          Dispatch hasn&rsquo;t posted tonight&rsquo;s roster
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-faint">
          The names appear here the moment they do. Leave this open — it fills
          itself in, and there is nothing to refresh.
        </p>
      </div>
    );
  }

  return (
    <TimeEditBoard
      nightKey={nightKey}
      session={session}
      uid={auth.status === "signedIn" ? auth.uid : ""}
    />
  );
}
