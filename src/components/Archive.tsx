"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { postAuthed, saveBlob, shareOrSave, shareSheetOnly } from "@/lib/api";
import { useSessions } from "@/lib/db/sessions";
import { stationDateLabel, stationTimeLabel } from "@/lib/constants";
import type { Session, SessionStatus } from "@/lib/types";

/**
 * Every night on record.
 *
 * Two copies of every closed night's sheet, and they answer two different
 * questions.
 *
 * Saved PDF is the sheet as it was when the night closed — filed in Storage by
 * End Day, or by the 7 AM job when nobody pressed it. It is what went to the
 * group, and it does not change when a time is corrected the next morning.
 * That is the point of keeping it.
 *
 * Rebuild is the night as its entries read now, rendered on the spot. A night
 * corrected after it closed reads differently here, and a night that has no
 * saved copy yet — closed in the last hour with no signal — can still be had.
 *
 * On a phone either one takes two taps rather than one — see `pull`. Nothing
 * here deletes. There is no control for it and no route behind it.
 */

/** What a button on a night fetches. */
type Kind = "saved" | "sheet" | "returns";

const ROUTE: Record<Kind, string> = {
  saved: "/api/sheet/archived",
  sheet: "/api/sheet",
  returns: "/api/returns",
};

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
  async function pull(nightKey: string, kind: Kind) {
    const key = `${nightKey}:${kind}`;
    const filename =
      kind === "returns" ? `returns-${nightKey}.xlsx` : `closing-${nightKey}.pdf`;
    const label = `${kind === "returns" ? "Returns" : "Closing sheet"} — ${stationDateLabel(
      new Date(`${nightKey}T12:00:00Z`),
    )}`;

    // The second tap. Nothing may be awaited before shareOrSave here.
    if (held?.key === key) {
      setFailure(null);
      const { how, why } = await shareOrSave(held.blob, filename, label);
      if (how === "failed") {
        setFailure(
          `The phone did not open the share sheet that time. The file is still built — tap Send again. (${why})`,
        );
      }
      return;
    }

    setBusy(key);
    setFailure(null);
    setHeld(null);
    try {
      const response = await postAuthed(ROUTE[kind], { nightKey });
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
        Saved PDF is the sheet exactly as it was when the night closed.
        Rebuild draws it again from the night&rsquo;s entries, so it includes
        anything corrected since. On a phone either is two taps: one to fetch
        it, one to send it.
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
  onPull: (nightKey: string, kind: Kind) => void;
}) {
  const status = STATUS[session.status];
  const saved = session.archivedPdf;
  const autoClosed = session.status === "closed" && session.closedBy === "auto";

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
          {/* Its own badge, beside the status rather than instead of it: the
              night is closed either way, and this says nobody pressed End Day. */}
          {autoClosed ? (
            <span className="rounded-full border border-line-strong bg-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Auto-closed
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-[12px] text-ink-muted">
          {session.totalExpected}{" "}
          {session.totalExpected === 1 ? "driver" : "drivers"}
          {session.managedBy ? ` · ${session.managedBy}` : ""}
        </p>
        <SavedLine session={session} />
      </div>

      <div className="flex flex-wrap gap-2">
        {saved ? (
          <File
            label="Saved PDF"
            fileKey={`${nightKey}:saved`}
            primary
            busy={busy}
            heldKey={heldKey}
            onPull={() => onPull(nightKey, "saved")}
          />
        ) : null}
        <File
          label="Rebuild"
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
  primary = false,
  busy,
  heldKey,
  onPull,
}: {
  label: string;
  fileKey: string;
  /** The button most people want on this night — the saved copy. */
  primary?: boolean;
  busy: string | null;
  heldKey: string | null;
  onPull: () => void;
}) {
  const held = heldKey === fileKey;

  return (
    <Button
      variant={held ? "arrived" : primary ? "primary" : "secondary"}
      loading={busy === fileKey}
      disabled={busy !== null}
      onClick={onPull}
      className="min-h-11"
    >
      {held ? `Send ${label.toLowerCase()}` : label}
    </Button>
  );
}

/**
 * When this night's sheet was saved, and who closed the night.
 *
 * "Saved 7:05 AM · Auto-closed" or "Saved 11:42 PM · End Day". A closed night
 * with nothing saved yet says so — the hourly job will file it — and an open
 * night says nothing, because there is nothing it should have yet.
 */
function SavedLine({ session }: { session: Session }) {
  const saved = session.archivedPdf;

  if (!saved) {
    if (session.status !== "closed") return null;
    return <p className="mt-0.5 text-[12px] text-ink-faint">Not archived yet</p>;
  }

  const at = saved.at ? stationTimeLabel(saved.at.toDate()) : null;
  const versions = session.pdfVersions.length;

  return (
    <p className="mt-0.5 text-[12px] text-ink-muted">
      {at ? `Saved ${at}` : "Saved"} · {saved.auto ? "Auto-closed" : "End Day"}
      {versions > 1 ? ` · ${versions} versions` : ""}
    </p>
  );
}
