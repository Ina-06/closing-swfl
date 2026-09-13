"use client";

import { useEffect, useRef } from "react";
import { TimeEditNotice } from "@/components/TimeEditNotice";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { FlagTag } from "@/components/ui/FlagToggle";
import type { RosterEntry } from "@/lib/types";

/**
 * A name off tonight's roster, opened before anybody has entered him.
 *
 * The dashed card used to write the moment it was touched: one tap put the
 * driver in the yard, marked him unannounced, and left a row on the sheet. A
 * tap is not a van pulling in — it is as often a thumb on the wrong line of a
 * list Karim is scrolling — and there was no way back from it that returned him
 * to being a name on the roster.
 *
 * So tapping the card opens this and writes nothing at all. It is the same
 * question the sheet asks about a driver who does have a row: is he here. Close
 * it and the night is exactly as it was, because nothing happened.
 *
 * Arrived is the moment something does. That is when the row is made, and from
 * there he is an ordinary driver on an ordinary sheet.
 */
export function RosterSheet({
  row,
  note,
  timeEdit,
  busy,
  error,
  onArrived,
  onClose,
}: {
  row: RosterEntry;
  /** Anything Karim wrote against this name while it was still dashed. */
  note: string;
  /** What HR changed about his hours tonight, or "". */
  timeEdit: string;
  busy: boolean;
  error: string | null;
  onArrived: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

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
        aria-label={row.fullName}
        tabIndex={-1}
        className="animate-sheet absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-safe outline-none"
      >
        <div className="mx-auto max-w-lg px-4 pb-6 pt-2.5">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong"
          />

          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-bold leading-tight tracking-tight">
                {row.fullName}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {row.isBud ? <FlagTag flag="bud" /> : null}
                {row.isTrainer ? <FlagTag flag="trn" /> : null}
                {row.isRescuer ? <FlagTag flag="res" /> : null}
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

          {note ? (
            <p className="mt-4 rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5 text-[14px] leading-snug text-warn">
              <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider">
                Note
              </span>
              {note}
            </p>
          ) : null}

          {timeEdit ? <TimeEditNotice>{timeEdit}</TimeEditNotice> : null}

          <section className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              From dispatch
            </h3>
            <p className="mt-2 rounded-xl border border-dashed border-line-strong bg-sunken/50 px-3.5 py-3 text-[13px] leading-relaxed text-ink-faint">
              He is on tonight&rsquo;s roster and dispatch hasn&rsquo;t entered
              him yet — no ETA, no returns. They fill it in afterwards.
            </p>
          </section>

          <div className="mt-6 space-y-3">
            <Button
              variant="arrived"
              size="lg"
              loading={busy}
              onClick={onArrived}
              className="min-h-14 w-full text-[17px]"
            >
              Arrived
            </Button>
            <p className="text-center text-[12px] leading-relaxed text-ink-faint">
              Puts him in the yard and opens his van. Nothing is written until
              you press it.
            </p>

            <Button
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={onClose}
              className="min-h-14 w-full text-[16px]"
            >
              Close
            </Button>
          </div>

          {error ? (
            <div className="mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
