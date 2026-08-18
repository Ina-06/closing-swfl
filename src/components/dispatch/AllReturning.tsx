"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote, SoftWarning } from "@/components/ui/Field";
import { postAuthed, saveAs } from "@/lib/api";
import { markAllReturning } from "@/lib/db/sessions";
import { returnsRows, unreadableReturns } from "@/lib/returnsReport";
import type { Entry, Session } from "@/lib/types";

/**
 * All Returning — the moment the wave stops being a stream of phone calls.
 *
 * Two things happen, and they are deliberately not one thing. Karim's phone is
 * told first, through the listener he already has open. The spreadsheet is
 * generated second, because a workbook is not worth making anyone wait for a
 * notification behind.
 *
 * The press is confirmed inline rather than in a dialog. This is the one
 * control on the screen that makes a phone in someone else's hand go off, and
 * it sits next to controls that get clicked all night — but a modal here would
 * still be a modal, so it turns into its own confirmation instead.
 */
export function AllReturning({
  nightKey,
  session,
  entries,
  uid,
}: {
  nightKey: string;
  session: Session;
  entries: Entry[];
  uid: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [archive, setArchive] = useState<{
    ok: boolean;
    bucket: string;
    reason: string;
  }>({ ok: true, bucket: "", reason: "" });

  const called = session.status !== "open";
  const withReturns = returnsRows(entries).length;
  const stillOut = entries.filter((entry) => entry.status !== "arrived").length;
  const unreadable = unreadableReturns(entries);

  async function download() {
    const response = await postAuthed("/api/returns", { nightKey });
    await saveAs(response, `returns-${nightKey}.xlsx`);

    const rows = Number(response.headers.get("X-Returns-Rows") ?? withReturns);
    const read = (name: string) =>
      decodeURIComponent(response.headers.get(name) ?? "");

    setArchive({
      ok: response.headers.get("X-Returns-Archived") !== "0",
      bucket: read("X-Returns-Bucket"),
      reason: read("X-Returns-Archive-Error"),
    });
    return rows;
  }

  async function call() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // Announce first. If the spreadsheet fails after this, Karim has still
      // been told, which is the half that cannot wait.
      await markAllReturning(nightKey, uid);
      const rows = await download();
      setConfirming(false);
      setNote(
        rows === 0
          ? "Karim's phone has been alerted. Nobody had returns tonight, so the spreadsheet is empty."
          : `Karim's phone has been alerted. Spreadsheet downloaded — ${rows} ${
              rows === 1 ? "driver" : "drivers"
            } with returns.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That did not go through.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function again() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const rows = await download();
      setNote(
        `Spreadsheet downloaded — ${rows} ${
          rows === 1 ? "driver" : "drivers"
        } with returns.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">
            {called ? "All Returning called" : "All Returning"}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {called
              ? "Karim has the banner. You can pull the spreadsheet again any time."
              : `Alerts Karim's phone and builds the returns spreadsheet — ${withReturns} ${
                  withReturns === 1 ? "driver" : "drivers"
                } with returns so far.`}
          </p>
        </div>

        {called ? (
          <Button variant="secondary" loading={busy} onClick={() => void again()}>
            Download the spreadsheet
          </Button>
        ) : confirming ? (
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              loading={busy}
              onClick={() => void call()}
            >
              Yes — alert Karim
            </Button>
            <Button
              variant="ghost"
              size="lg"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={() => setConfirming(true)}
            disabled={entries.length === 0}
            title={
              entries.length === 0 ? "Nobody is on the sheet yet" : undefined
            }
          >
            All Returning
          </Button>
        )}
      </div>

      {confirming && stillOut > 0 ? (
        <div className="mt-3">
          {/* Soft, and it does not stop the press. There is nothing wrong with
              calling it while drivers are still out — that is what it means. */}
          <SoftWarning>
            {stillOut} {stillOut === 1 ? "driver is" : "drivers are"} still out.
            That is normal — this tells Karim they are all on the way in.
          </SoftWarning>
        </div>
      ) : null}

      {unreadable.length > 0 ? (
        <div className="mt-3">
          {/* Named, not counted: the fix is to go and look at that one row, and
              a number would not tell them which. */}
          <SoftWarning>
            No number in the returns for {unreadable.join(", ")} — that line
            will not be in the spreadsheet. If they did bring something back,
            put the count in front of it, like <strong>1 Damaged</strong>.
          </SoftWarning>
        </div>
      ) : null}

      {note ? (
        <p className="mt-3 rounded-md border border-arrived-line bg-arrived-soft px-3 py-2 text-[13px] font-medium text-arrived">
          {note}
        </p>
      ) : null}

      {!archive.ok ? (
        <div className="mt-3">
          {/* The reason comes from the server rather than being guessed here.
              There are four or five different things that stop an upload and
              they have four or five different fixes. */}
          <SoftWarning>
            <strong>The file downloaded but was not archived.</strong> Nothing
            is lost — the spreadsheet in your downloads is the same file — but
            it will not be in the Phase 7 archive.
            <span className="mt-1.5 block font-mono text-[12px] leading-relaxed">
              bucket: {archive.bucket || "(none)"}
              <br />
              {archive.reason || "no reason reported"}
            </span>
          </SoftWarning>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
    </section>
  );
}
