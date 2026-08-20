"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { postAuthed, saveBlob, shareOrSave, shareSheetOnly } from "@/lib/api";
import { useSessions } from "@/lib/db/sessions";
import { stationDateLabel } from "@/lib/constants";
import type { Session, SessionStatus } from "@/lib/types";

/**
 * Every night on record.
 *
 * The files are rebuilt on demand rather than fetched from anywhere, and that
 * is the whole design of this screen. A stored file is one that can go missing,
 * or expire, or be the version from before someone corrected a clock-out. The
 * entries are the record; the PDF is a rendering of them, and it can be
 * rendered again from any night that was ever opened.
 *
 * On a phone that takes two taps rather than one — see `pull`. Nothing here
 * deletes. There is no control for it and no route behind it.
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
  /**
   * A file that has been built and is waiting for the tap that sends it.
   *
   * One slot, not one per night: he is sending a sheet, not collecting them.
   */
  const [held, setHeld] = useState<{ key: string; blob: Blob } | null>(null);

  /**
   * Build a night's file, then hand it over.
   *
   * One tap anywhere that downloads files properly. Two on an iPhone, and the
   * split is the point: the second tap is the one that opens the share sheet,
   * and it has to be a tap that has not just spent itself on a network request.
   * Building inside the gesture is what stopped the share sheet opening at all.
   */
  async function pull(nightKey: string, kind: "sheet" | "returns") {
    const key = `${nightKey}:${kind}`;
    const filename =
      kind === "sheet" ? `closing-${nightKey}.pdf` : `returns-${nightKey}.xlsx`;
    const label = `${kind === "sheet" ? "Closing sheet" : "Returns"} — ${stationDateLabel(
      new Date(`${nightKey}T12:00:00Z`),
    )}`;

    // The second tap. Nothing may be awaited before shareOrSave here.
    if (held?.key === key) {
      setFailure(null);
      const how = await shareOrSave(held.blob, filename, label);
      if (how === "failed") {
        setFailure(
          "The phone did not open the share sheet that time. The file is still built — tap Send again.",
        );
      }
      return;
    }

    setBusy(key);
    setFailure(null);
    setHeld(null);
    try {
      const response = await postAuthed(`/api/${kind}`, { nightKey });
      const blob = await response.blob();
      if (shareSheetOnly()) {
        setHeld({ key, blob });
      } else {
        saveBlob(blob, filename);
      }
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
              heldKey={held?.key ?? null}
              canBuildReturns={canBuildReturns}
              onPull={pull}
            />
          </li>
        ))}
      </ul>

      <p className="pt-1 text-[12px] leading-relaxed text-ink-faint">
        Files are rebuilt from the night&rsquo;s entries each time you ask for
        one, so they are never out of date and never expire. On a phone that is
        two taps: one to build it, one to send it.
      </p>
    </div>
  );
}

function Night({
  nightKey,
  session,
  busy,
  heldKey,
  canBuildReturns,
  onPull,
}: {
  nightKey: string;
  session: Session;
  busy: string | null;
  /** The one file already built and waiting to be sent, if it is this one. */
  heldKey: string | null;
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
        <File
          label="Sheet PDF"
          fileKey={`${nightKey}:sheet`}
          busy={busy}
          heldKey={heldKey}
          onPull={() => onPull(nightKey, "sheet")}
        />
        {canBuildReturns ? (
          <File
            label="Returns"
            fileKey={`${nightKey}:returns`}
            busy={busy}
            heldKey={heldKey}
            onPull={() => onPull(nightKey, "returns")}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * One file on one night.
 *
 * Turns into Send once it is built, which on a phone is the tap that opens the
 * share sheet. Green, because at that point it is a different action: the file
 * exists, and this sends it.
 */
function File({
  label,
  fileKey,
  busy,
  heldKey,
  onPull,
}: {
  label: string;
  fileKey: string;
  busy: string | null;
  heldKey: string | null;
  onPull: () => void;
}) {
  const held = heldKey === fileKey;

  return (
    <Button
      variant={held ? "arrived" : "secondary"}
      loading={busy === fileKey}
      disabled={busy !== null}
      onClick={onPull}
    >
      {held ? `Send ${label.toLowerCase()}` : label}
    </Button>
  );
}
