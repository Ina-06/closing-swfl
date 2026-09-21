"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { useViewport } from "@/lib/viewport";
import { stationDateLabel } from "@/lib/constants";
import type { RepairTask } from "@/lib/types";

/** What the board writes, whether the job is new or being corrected. */
export type TaskFields = {
  title: string;
  van: string;
  detail: string;
  grounded: boolean;
};

/**
 * Adding a job, and correcting one — the same sheet.
 *
 * They are the same four fields and the same keyboard problem, and splitting
 * them in two would mean two places for the van number box to drift. What
 * actually differs is what is already in it, what the button says, and whether
 * there is anything to delete, and all three of those fall out of one argument
 * being null.
 *
 * A bottom sheet on the laptop as well as the phone. It looks like a phone
 * pattern and it is, but this board is opened on both by the same people, and
 * a dialog that arrives from a different edge depending on the machine is a
 * dialog they have to learn twice.
 */
export function TaskSheet({
  task,
  onSave,
  onDelete,
  onClose,
}: {
  /** Null when this is a new job. */
  task: RepairTask | null;
  onSave: (fields: TaskFields) => void;
  /** Absent for a new job — there is nothing yet to remove. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [van, setVan] = useState(task?.van ?? "");
  const [detail, setDetail] = useState(task?.detail ?? "");
  const [grounded, setGrounded] = useState(task?.grounded ?? false);
  /** Delete has been pressed once. It is never the first press that removes. */
  const [confirming, setConfirming] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  /**
   * Whether we are in the browser yet, so the portal below has a body to go to.
   * The same shape NoteSheet uses, and here for the same reason: a caller that
   * renders this during SSR should get nothing rather than a crash.
   */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    // A new job opens on an empty box with the caret in it, because the next
    // thing that happens is typing. An existing one opens focused at the end
    // of what it already says, because the common case is adding to it.
    const field = box.current;
    if (field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }

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

  /**
   * Lifted clear of the keyboard, the same way the note sheet is.
   *
   * A sheet anchored to the bottom of the screen is anchored to the strip of
   * glass the keyboard is now drawn over, so the Save button and the van
   * number box were both underneath it — see lib/viewport for the whole of it.
   */
  const viewport = useViewport();
  const panelStyle =
    viewport.height === null
      ? undefined
      : {
          bottom: viewport.inset,
          maxHeight:
            viewport.inset > 0
              ? viewport.height - 8
              : Math.round(viewport.height * 0.9),
        };

  const ready = title.trim() !== "";

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={task ? `Edit: ${task.title}` : "Add a job"}
        style={panelStyle}
        className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-safe"
      >
        <div className="mx-auto w-full max-w-lg px-4 pb-6 pt-2.5">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong"
          />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold leading-tight tracking-tight">
                {task ? "Edit this job" : "Add a job"}
              </h2>
              {/* Where it came from, on the one screen where somebody is about
                  to change what it says. A job posted by End Day is a line off
                  a closing sheet, and knowing which night it came off is what
                  tells you whether correcting it is safe. */}
              <p className="mt-1 text-[13px] leading-snug text-ink-muted">
                {task?.source === "endDay" && task.nightKey
                  ? `From the close on ${stationDateLabel(
                      new Date(`${task.nightKey}T12:00:00Z`),
                    )}${task.driverName ? ` · ${task.driverName}` : ""}`
                  : task
                    ? "Added by hand on this board."
                    : "It stays on the list until somebody ticks it off."}
              </p>
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
          </div>

          <Label htmlFor="repair-title">What is wrong</Label>
          <textarea
            id="repair-title"
            ref={box}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            rows={2}
            placeholder="Nearside mirror hanging off"
            className={FIELD}
          />

          <Label htmlFor="repair-van">Van number</Label>
          <input
            id="repair-van"
            value={van}
            onChange={(event) => setVan(event.target.value)}
            placeholder="214"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            /* Not `inputMode="numeric"`: some of these carry a letter, and a
               keypad with no letters on it is a box that cannot be filled in. */
            className={`${FIELD} tnum font-mono`}
          />

          <Label htmlFor="repair-detail">
            Notes <Hint>optional</Hint>
          </Label>
          <textarea
            id="repair-detail"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={2}
            placeholder="Part on order, garage called Tuesday"
            className={FIELD}
          />

          {/* A switch rather than a checkbox, because it is not a field about
              the job — it is a statement about where the van is right now, and
              it moves the row to the top of the board and turns it red. */}
          <button
            type="button"
            role="switch"
            aria-checked={grounded}
            onClick={() => setGrounded(!grounded)}
            className={`mt-4 flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors ${
              grounded
                ? "border-overdue-line bg-overdue-soft"
                : "border-line-strong bg-surface active:brightness-[0.97]"
            }`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                grounded
                  ? "border-overdue bg-overdue text-ink-inverse"
                  : "border-line-strong bg-surface"
              }`}
            >
              {grounded ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l5 5 9-10.5" />
                </svg>
              ) : null}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-[15px] font-bold ${
                  grounded ? "text-overdue" : "text-ink"
                }`}
              >
                Van is off the road
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
                Pins it to the top of the list until it is ticked off.
              </span>
            </span>
          </button>

          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="lg"
              disabled={!ready}
              onClick={() =>
                onSave({
                  title: title.trim(),
                  van: van.trim(),
                  detail: detail.trim(),
                  grounded,
                })
              }
              className="min-h-14 flex-1 text-[16px]"
            >
              {task ? "Save changes" : "Add it"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={onClose}
              className="min-h-14"
            >
              Cancel
            </Button>
          </div>

          {!ready ? (
            <p className="mt-2 text-center text-[12px] text-ink-faint">
              Say what is wrong with it first.
            </p>
          ) : null}

          {/* Two presses, and the second one is the only red button on the
              sheet. Ticking a job off says the van was seen to; removing one
              says it should never have been asked for, and that is a different
              claim — worth making, and worth being sure about. */}
          {onDelete ? (
            <div className="mt-5 border-t border-line pt-4">
              {confirming ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13px] font-medium text-ink-muted">
                    Remove this job for good?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onDelete}
                      className="min-h-11 rounded-lg border border-overdue-line bg-overdue-soft px-3.5 text-[13px] font-bold text-overdue transition-colors active:brightness-[0.97]"
                    >
                      Remove it
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="min-h-11 rounded-lg px-3.5 text-[13px] font-semibold text-ink-muted"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="min-h-11 text-[13px] font-semibold text-ink-faint transition-colors hover:text-overdue"
                >
                  Remove this job
                </button>
              )}
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
                Only for something typed by mistake. If the van was seen to,
                tick it off instead — that keeps it in the archive.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* 16px on the control itself, or iOS Safari zooms the page on focus. */
const FIELD =
  "mt-1.5 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[16px] leading-snug text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand";

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mt-4 block text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
    >
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-normal normal-case tracking-normal">({children})</span>
  );
}
