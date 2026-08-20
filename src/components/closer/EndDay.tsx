"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote, SoftWarning } from "@/components/ui/Field";
import { postAuthed, shareOrSave } from "@/lib/api";
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
  /**
   * Tonight's PDF, rendered and kept before he ever reaches for Share.
   *
   * This is not an optimisation. Building it inside the tap spends the user
   * gesture on a network round trip and a server-side render, and by the time
   * the share sheet is asked for, iOS has stopped counting the tap as
   * user-initiated — see shareOrSave. The file has to be in hand first.
   */
  const [sheet, setSheet] = useState<Blob | null>(null);
  const [building, setBuilding] = useState(false);
  const asked = useRef(false);

  const closed = session.status === "closed";
  const filename = `closing-${nightKey}.pdf`;
  const everyoneIn = outstanding === 0 && entries.length > 0;
  const dateLabel = stationDateLabel(new Date(`${nightKey}T12:00:00Z`));

  /**
   * Render tonight's sheet and hold on to it.
   *
   * Nothing is filed anywhere on the way past — the PDF goes to the group chat,
   * which is where anyone actually looks for it. Any night can be rendered
   * again from its entries under Past nights, so there is nothing here that
   * only exists once.
   */
  const prepare = useCallback(async () => {
    asked.current = true;
    setBuilding(true);
    setError(null);
    try {
      const response = await postAuthed("/api/sheet", { nightKey });
      setSheet(await response.blob());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The sheet would not build.",
      );
    } finally {
      setBuilding(false);
    }
  }, [nightKey]);

  /**
   * Start building the moment the night is closed, however it got closed.
   *
   * Usually that is End Day on this phone, but the dispatcher can close a night
   * from their end, and Karim can come back to a closed one after a reload. In
   * all three he arrives at a Share button, and it has to be a button that
   * sends rather than one that starts a download.
   */
  useEffect(() => {
    if (!closed || asked.current) return;
    void prepare();
  }, [closed, prepare]);

  async function end() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // Closed first, so the dispatcher's screen says so immediately. The
      // document takes as long as it takes.
      await closeSession(nightKey, uid);
      setConfirming(false);
      await prepare();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * The tap that sends it, and nothing else in front of it.
   *
   * No await before shareOrSave — not a fetch, not a token refresh. The gesture
   * has to still be the user's when the share sheet is asked for.
   */
  async function share() {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const how = await shareOrSave(sheet, filename, `Closing sheet — ${dateLabel}`);
      if (how === "saved") {
        setNote("Saved to this device. Send it on from your files.");
      }
      if (how === "failed") {
        setError(
          "The phone did not open the share sheet that time. The sheet is built and waiting — tap Share again.",
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

        {/* Three states, because the file behind this button has to exist
            before the button is worth pressing. Sending it is one tap on a
            sheet already rendered; a build that failed gets its own button
            rather than leaving a dead one on screen. */}
        {sheet ? (
          <Button
            variant="arrived"
            size="lg"
            loading={busy}
            onClick={() => void share()}
            className="mt-3 min-h-14 w-full text-[16px]"
          >
            Share the sheet
          </Button>
        ) : building ? (
          <Button
            variant="arrived"
            size="lg"
            loading
            disabled
            className="mt-3 min-h-14 w-full text-[16px]"
          >
            Building the sheet
          </Button>
        ) : (
          <Button
            variant="arrived"
            size="lg"
            onClick={() => void prepare()}
            className="mt-3 min-h-14 w-full text-[16px]"
          >
            Build the sheet again
          </Button>
        )}

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
