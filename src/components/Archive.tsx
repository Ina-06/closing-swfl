"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { postAuthed, saveAs } from "@/lib/api";
import { useSessions } from "@/lib/db/sessions";
import { stationDateLabel } from "@/lib/constants";
import type { Session, SessionStatus } from "@/lib/types";

/**
 * Every night on record.
 *
 * The files are rebuilt on demand rather than fetched from Storage, and that
 * is the whole design of this screen. A stored url is a url that can expire,
 * or that was never written because the bucket was not switched on that week.
 * The entries are the record; the PDF is a rendering of them, and it can be
 * rendered again from any night that was ever opened.
 *
 * Nothing here deletes. There is no control for it and no route behind it.
 */

const STATUS: Record<SessionStatus, { label: string; tone: string }> = {
  open: { label: "Open", tone: "border-brand-line bg-brand-soft text-brand" },
  allReturning: {
    label: "All returning",
    tone: "border-warn-line bg-warn-soft text-warn",
  },
  closed: {
    label: "Closed",
    tone: "border-arrived-line bg-arrived-soft text-arrived",
  },
};

export function Archive({ canBuildReturns }: { canBuildReturns: boolean }) {
  const { sessions, loading, error } = useSessions();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function pull(nightKey: string, kind: "sheet" | "returns") {
    setBusy(`${nightKey}:${kind}`);
    setFailure(null);
    try {
      const response = await postAuthed(`/api/${kind}`, { nightKey });
      await saveAs(
        response,
        kind === "sheet"
          ? `closing-${nightKey}.pdf`
          : `returns-${nightKey}.xlsx`,
      );
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "That did not download.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return <ErrorNote>Could not read the archive: {error}</ErrorNote>;
  }

  if (loading || sessions === null) {
    return (
      <div
        className="h-48 animate-pulse rounded-xl border border-line bg-surface"
        aria-busy="true"
        aria-label="Loading past nights"
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center">
        <p className="text-[15px] font-semibold text-ink-muted">
          No nights on record yet
        </p>
        <p className="mt-1.5 text-[13px] text-ink-faint">
          Every night that gets opened stays here for good.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {failure ? <ErrorNote>{failure}</ErrorNote> : null}

      <ul className="space-y-2">
        {sessions.map(({ id, session }) => (
          <li key={id}>
            <Night
              nightKey={id}
              session={session}
              busy={busy}
              canBuildReturns={canBuildReturns}
              onPull={pull}
            />
          </li>
        ))}
      </ul>

      <p className="pt-1 text-[12px] leading-relaxed text-ink-faint">
        Files are rebuilt from the night&rsquo;s entries each time you ask for
        one, so they are never out of date and never expire.
      </p>
    </div>
  );
}

function Night({
  nightKey,
  session,
  busy,
  canBuildReturns,
  onPull,
}: {
  nightKey: string;
  session: Session;
  busy: string | null;
  canBuildReturns: boolean;
  onPull: (nightKey: string, kind: "sheet" | "returns") => void;
}) {
  const status = STATUS[session.status];

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold tracking-tight">
            {stationDateLabel(new Date(`${nightKey}T12:00:00Z`))}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.tone}`}
          >
            {status.label}
          </span>
        </p>
        <p className="mt-1 text-[12px] text-ink-muted">
          {session.totalExpected}{" "}
          {session.totalExpected === 1 ? "driver" : "drivers"}
          {session.managedBy ? ` · ${session.managedBy}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={busy === `${nightKey}:sheet`}
          disabled={busy !== null}
          onClick={() => onPull(nightKey, "sheet")}
        >
          Sheet PDF
        </Button>
        {canBuildReturns ? (
          <Button
            variant="secondary"
            loading={busy === `${nightKey}:returns`}
            disabled={busy !== null}
            onClick={() => onPull(nightKey, "returns")}
          >
            Returns
          </Button>
        ) : null}
      </div>
    </div>
  );
}
