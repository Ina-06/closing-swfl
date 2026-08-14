"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { FlagTag } from "@/components/ui/FlagToggle";
import { flagsOn } from "@/components/closer/DriverCard";
import { correctClockOut, markArrived, reopenEntry } from "@/lib/db/closer";
import {
  stationInstant,
  stationTimeInputValue,
  stationTimeLabel,
} from "@/lib/constants";
import { lateLabel } from "@/lib/eta";
import type { Entry } from "@/lib/types";

/**
 * The sheet behind a card.
 *
 * One decision lives here — this van is in — and the button that makes it is
 * the biggest thing on the screen. Everything above it is context Karim needs
 * before he taps: who this is, when he was due, and anything the dispatcher
 * flagged.
 */
export function ArrivalSheet({
  nightKey,
  entry,
  late,
  uid,
  onClose,
}: {
  nightKey: string;
  /** Read live from the snapshot, so a correction on the laptop lands here. */
  entry: Entry;
  late: number | null;
  uid: string;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    // Stop the list behind the sheet from scrolling under his thumb.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  const arrived = entry.status === "arrived";
  const stamped = entry.clockOut;

  function startEditing() {
    setDraft(
      stamped
        ? stationTimeInputValue(stamped.toDate())
        : stationTimeInputValue(new Date()),
    );
    setEditingTime(true);
  }

  async function saveTime() {
    const [hours, minutes] = draft.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      setError("That time did not read as a time.");
      return;
    }
    await run(async () => {
      await correctClockOut(
        nightKey,
        entry.id,
        stationInstant(nightKey, hours, minutes),
        uid,
      );
      setEditingTime(false);
    });
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={entry.fullName}
        tabIndex={-1}
        className="animate-sheet absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-safe outline-none"
      >
        <div className="mx-auto max-w-lg px-4 pb-5 pt-2.5">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong"
          />

          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-bold leading-tight tracking-tight">
                {entry.fullName}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {flagsOn(entry).map((flag) => (
                  <FlagTag key={flag} flag={flag} />
                ))}
                {entry.eta ? (
                  <span className="tnum rounded-full border border-line bg-sunken px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-muted">
                    ETA {entry.eta}
                  </span>
                ) : null}
                {late !== null ? (
                  <span className="rounded-full border border-overdue-line bg-overdue-soft px-2 py-0.5 text-[11px] font-bold text-overdue">
                    {lateLabel(late)}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-faint active:bg-sunken"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="size-5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          {entry.notes ? (
            <p className="mt-4 rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5 text-[14px] leading-snug text-warn">
              <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider">
                Note
              </span>
              {entry.notes}
            </p>
          ) : null}

          {error ? (
            <div className="mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {arrived ? (
              <ArrivedPanel
                entry={entry}
                busy={busy}
                editing={editingTime}
                draft={draft}
                onDraft={setDraft}
                onStartEditing={startEditing}
                onCancelEditing={() => setEditingTime(false)}
                onSave={saveTime}
                onStamp={() => run(() => markArrived(nightKey, entry.id, uid))}
                onReopen={() => run(() => reopenEntry(nightKey, entry.id, uid))}
              />
            ) : (
              <Button
                variant="arrived"
                size="lg"
                loading={busy}
                onClick={() => run(() => markArrived(nightKey, entry.id, uid))}
                className="min-h-14 w-full text-[17px]"
              >
                Arrived
              </Button>
            )}
          </div>

          <p className="mt-4 text-center text-[12px] text-ink-faint">
            Van number, issues and the cell / key / fuel checks arrive in Phase 5.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * What the sheet becomes once he is in.
 *
 * The time is a button because it is the thing most likely to be wrong — the
 * van parked while Karim was walking the yard and he stamped it four minutes
 * later. Correcting it should not need a menu.
 */
function ArrivedPanel({
  entry,
  busy,
  editing,
  draft,
  onDraft,
  onStartEditing,
  onCancelEditing,
  onSave,
  onStamp,
  onReopen,
}: {
  entry: Entry;
  busy: boolean;
  editing: boolean;
  draft: string;
  onDraft: (next: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void;
  onStamp: () => void;
  onReopen: () => void;
}) {
  const stamped = entry.clockOut;

  if (editing) {
    return (
      <div className="rounded-xl border border-arrived-line bg-arrived-soft p-3.5">
        <label
          htmlFor="clock-out"
          className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-arrived"
        >
          Clocked out at
        </label>
        <input
          id="clock-out"
          type="time"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          className="tnum mt-2 w-full rounded-lg border border-arrived-line bg-surface px-3 py-3 text-center font-mono text-[24px] font-bold text-ink outline-none focus:border-arrived"
        />
        <div className="mt-3 flex gap-2">
          <Button
            variant="arrived"
            size="lg"
            loading={busy}
            onClick={onSave}
            className="min-h-12 flex-1"
          >
            Save time
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={busy}
            onClick={onCancelEditing}
            className="min-h-12"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {stamped ? (
        <button
          type="button"
          onClick={onStartEditing}
          disabled={busy}
          className="block w-full rounded-xl border border-arrived-line bg-arrived-soft px-4 py-4 text-center"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-arrived">
            Clocked out
          </span>
          <span className="tnum mt-1 block font-mono text-[30px] font-bold leading-none tracking-tight text-arrived">
            {stationTimeLabel(stamped.toDate())}
          </span>
          <span className="mt-2 block text-[12px] font-medium text-arrived/80">
            Tap to correct
          </span>
        </button>
      ) : (
        /* Marked done from the laptop — the driver phoned his own time in.
           There is no stamp behind it, so it is labelled as what it is. */
        <div className="rounded-xl border border-line bg-sunken px-4 py-4 text-center">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Reported to dispatch
          </span>
          <span className="tnum mt-1 block font-mono text-[30px] font-bold leading-none tracking-tight text-ink">
            {entry.clockOutManual || "—"}
          </span>
          <span className="mt-2 block text-[12px] text-ink-muted">
            Not stamped here
          </span>
        </div>
      )}

      {stamped ? null : (
        <Button
          variant="arrived"
          size="lg"
          loading={busy}
          onClick={onStamp}
          className="min-h-14 w-full text-[17px]"
        >
          Stamp arrival now
        </Button>
      )}

      <Button
        variant="ghost"
        size="lg"
        disabled={busy}
        onClick={onReopen}
        className="min-h-12 w-full"
      >
        Put back on the list
      </Button>
    </>
  );
}
