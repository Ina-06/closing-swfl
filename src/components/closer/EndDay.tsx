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
 * There is no button at all until every driver on the sheet is clocked out.
 * Not a warning, not an override: a night is not over while a van is out, and
 * a closer signing off on one that is not finished is not a thing the app
 * should make possible.
 *
 * That is not a dead end. A driver who genuinely is not coming back to the
 * yard gets clocked out by the dispatcher from their side, which is the right
 * place for that call to be made — it is a decision about the night, not about
 * the yard.
 */
export function EndDay({
  nightKey,
  session,
  entries,
  outstanding,
  pending,
  uid,
}: {
  nightKey: string;
  session: Session;
  entries: Entry[];
  /**
   * Drivers on the sheet not yet clocked out, whether they are still on the
   * road or standing at the van. Any at all hides this whole panel.
   */
  outstanding: number;
  /** On the roster but never entered by dispatch — a note, not a blocker. */
  pending: number;
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
  const everyoneIn = outstanding === 0 && entries.length > 0;

  /**
   * Render tonight's sheet, and keep it.
   *
   * Nothing is filed anywhere on the way past — the PDF goes to the group chat,
   * which is where anyone actually looks for it. Any night can be rendered
   * again from its entries under Past nights, so there is nothing here that
   * only exists once.
   */
  async function build(): Promise<Blob> {
    const response = await postAuthed("/api/sheet", { nightKey });
    const blob = await response.blob();
    setSheet(blob);
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
      setNote("Sheet built and saved to this phone.");
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

  /**
   * Nothing to show yet.
   *
   * A closer with a van still out, or one still open in front of him, has no
   * decision to make here, so he is not given one — the counter at the top of
   * his screen is already telling him what is left, and a disabled button
   * underneath it would only be a second way of saying the same thing.
   */
  if (!everyoneIn) return null;

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface px-4 py-4">
      <h2 className="text-[15px] font-bold tracking-tight">End day</h2>
      <p className="mt-0.5 text-[13px] text-ink-muted">
        Everyone is in. This closes the night and builds the sheet.
      </p>

      {/* On the roster but never entered by dispatch. Not a reason to stop him
          — they were never his to clock out — but he should know before the
          sheet goes up without them. */}
      {pending > 0 ? (
        <div className="mt-3">
          <SoftWarning>
            {pending} {pending === 1 ? "driver is" : "drivers are"} on tonight&rsquo;s
            roster but never made it onto the sheet. They will not be on the
            PDF.
          </SoftWarning>
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
              Close the night
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
            variant="arrived"
            size="lg"
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
