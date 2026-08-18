"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote, SoftWarning } from "@/components/ui/Field";
import { postAuthed, saveBlob, shareOrSave } from "@/lib/api";
import { closeSession } from "@/lib/db/sessions";
import { stationDateLabel } from "@/lib/constants";
import type { Entry, Session } from "@/lib/types";

/**
 * End Day — the last thing Karim does before he goes home.
 *
 * It only becomes the loud button on the screen once every driver is in.
 * Before that it is still there, but it is a quiet one that makes him read the
 * list of who is missing first. Closing early is a real thing that happens —
 * someone is stuck an hour out and the sheet has to go up — so it is never
 * blocked, only shown its consequences.
 */
export function EndDay({
  nightKey,
  session,
  entries,
  waiting,
  uid,
}: {
  nightKey: string;
  session: Session;
  entries: Entry[];
  /** Drivers not yet clocked out, in the order the board is showing them. */
  waiting: Entry[];
  uid: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Kept so Share does not have to fetch inside the tap and lose the gesture. */
  const [sheet, setSheet] = useState<Blob | null>(null);

  const closed = session.status === "closed";
  const filename = `closing-${nightKey}.pdf`;
  const everyoneIn = waiting.length === 0 && entries.length > 0;

  async function build(): Promise<Blob> {
    const response = await postAuthed("/api/sheet", { nightKey });
    const blob = await response.blob();
    setSheet(blob);
    if (response.headers.get("X-Sheet-Archived") === "0") {
      setNote(
        "Sheet ready. It could not be filed in the archive — dispatch will see why.",
      );
    }
    return blob;
  }

  async function end() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // Closed first, so the dispatcher's screen says so immediately. The
      // document takes as long as it takes.
      await closeSession(nightKey, uid);
      const blob = await build();
      setConfirming(false);
      saveBlob(blob, filename);
      setNote((current) => current ?? "Sheet built and saved to this phone.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const blob = sheet ?? (await build());
      const how = await shareOrSave(
        blob,
        filename,
        `Closing sheet — ${stationDateLabel(new Date(`${nightKey}T12:00:00Z`))}`,
      );
      if (how === "saved") {
        setNote(
          "This phone has no share sheet, so it downloaded instead. Send it from your files.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share that.");
    } finally {
      setBusy(false);
    }
  }

  if (closed) {
    return (
      <section className="mt-4 rounded-xl border border-arrived-line bg-arrived-soft px-4 py-4">
        <h2 className="text-[15px] font-bold text-arrived">Night closed</h2>
        <p className="mt-0.5 text-[13px] text-arrived/80">
          Send the sheet to the group.
        </p>

        <Button
          variant="arrived"
          size="lg"
          loading={busy}
          onClick={() => void share()}
          className="mt-3 min-h-14 w-full text-[16px]"
        >
          Share the sheet
        </Button>

        {note ? (
          <p className="mt-2 text-center text-[12px] text-arrived/80">{note}</p>
        ) : null}
        {error ? (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface px-4 py-4">
      <h2 className="text-[15px] font-bold tracking-tight">End day</h2>
      <p className="mt-0.5 text-[13px] text-ink-muted">
        {everyoneIn
          ? "Everyone is in. This closes the night and builds the sheet."
          : entries.length === 0
            ? "Nothing on the sheet to close yet."
            : `${waiting.length} still out.`}
      </p>

      {confirming && waiting.length > 0 ? (
        <div className="mt-3 space-y-2">
          {/* Named before he can press it. A count is not something anyone can
              check against the yard; a list is. */}
          <SoftWarning>
            Still out — closing now leaves them without a clock-out on the
            sheet.
          </SoftWarning>
          <ul className="flex flex-wrap gap-1.5">
            {waiting.map((entry) => (
              <li
                key={entry.id}
                className="rounded-full border border-overdue-line bg-overdue-soft px-2.5 py-1 text-[13px] font-semibold text-overdue"
              >
                {entry.fullName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        {confirming ? (
          <>
            <Button
              variant="arrived"
              size="lg"
              loading={busy}
              onClick={() => void end()}
              className="min-h-14 flex-1 text-[16px]"
            >
              {waiting.length > 0 ? "Close anyway" : "Close the night"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="min-h-14"
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant={everyoneIn ? "arrived" : "secondary"}
            size="lg"
            disabled={entries.length === 0}
            onClick={() => setConfirming(true)}
            className="min-h-14 w-full text-[16px]"
          >
            End day
          </Button>
        )}
      </div>

      {note ? (
        <p className="mt-2 text-center text-[12px] text-ink-muted">{note}</p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
    </section>
  );
}
