"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { saveYard } from "@/lib/db/closer";
import type { Entry } from "@/lib/types";

/**
 * What is wrong with tonight, on one grid at the bottom of the screen.
 *
 * Only the drivers with something against them — a van issue, or a note from
 * dispatch. A clean handover has nothing anybody needs to read back, and twenty
 * rows of dashes would bury the three that matter. This is the list Karim runs
 * an eye down before he ends the night, so the shorter it is the better it
 * works: everything on it is something somebody has to do something about.
 *
 * Read right to left, which is why the name is last. By the time he is down
 * here he is not looking anybody up — he is checking that what dispatch asked
 * for got done, so the note comes first and the name is what closes the row.
 *
 * The order is the order they will be numbered on the PDF, and it is the same
 * live data as the cards, so it fills itself in as he works. Nothing to refresh
 * and nothing to press.
 */
export function Summary({
  nightKey,
  entries,
  uid,
}: {
  nightKey: string;
  entries: Entry[];
  uid: string;
}) {
  /** The driver whose van issues are open for editing, by id. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (entries.length === 0) return null;

  const flagged = entries.filter(
    (entry) => entry.vanIssues.trim() !== "" || entry.notes.trim() !== "",
  );

  /** Read from what is rendered, not from the id — the row may have moved. */
  const editing = editingId
    ? (entries.find((entry) => entry.id === editingId) ?? null)
    : null;

  return (
    <section className="space-y-2 pt-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        Summary
      </h2>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {flagged.length === 0 ? (
        /* Said out loud rather than left blank. An empty section reads as one
           that has not loaded, and "nothing wrong tonight" is the answer he
           came down here for. */
        <p className="rounded-xl border border-arrived-line bg-arrived-soft px-4 py-3.5 text-[14px] font-semibold text-arrived">
          No van issues and no notes tonight.
        </p>
      ) : (
        <>
          {/* Four columns will not fit a phone honestly, so the table keeps its
              width and scrolls inside its own box. Squeezing van issues into
              forty pixels would be worse than sliding it into view. */}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-sunken/60">
                  <Head className="w-[30%]">
                    Notes{" "}
                    <span className="font-normal normal-case tracking-normal opacity-70">
                      (disp)
                    </span>
                  </Head>
                  <Head className="w-[13%]">Van #</Head>
                  <Head className="w-[33%]">Van issues</Head>
                  <Head className="w-[24%]">Name</Head>
                </tr>
              </thead>

              <tbody>
                {flagged.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-line align-top last:border-0"
                  >
                    <td className="px-3 py-2.5 text-[13px] leading-snug text-ink-muted">
                      {entry.notes.trim() || <Blank />}
                    </td>
                    <td className="tnum px-3 py-2.5 font-mono text-[13px] font-bold leading-snug text-ink-muted">
                      {entry.van || <Blank />}
                    </td>

                    {/* The one cell on this grid that is a control. Something
                        turns up in the walk-round after the van has been signed
                        off — a light out, a mirror — and until now the only way
                        to record it was to find the driver's card again and go
                        back in through the van. It writes the same field, so
                        the card and the PDF say it too. */}
                    <td className="p-0">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setEditingId(entry.id);
                        }}
                        aria-label={`Van issues for ${entry.fullName}`}
                        className="flex min-h-11 w-full items-start gap-1.5 px-3 py-2.5 text-left text-[13px] leading-snug text-ink transition-colors active:bg-sunken"
                      >
                        <span className="min-w-0 flex-1">
                          {entry.vanIssues.trim() || (
                            <span className="text-ink-faint">Add</span>
                          )}
                        </span>
                        <Pencil />
                      </button>
                    </td>

                    <td className="px-3 py-2.5 text-[13px] font-semibold leading-snug">
                      {entry.fullName}
                      {/* Two rows under one name are two trips, not a slip of
                          the thumb. Said here as well as on the cards, because
                          this grid is the last thing he reads before he signs
                          the night off. */}
                      {entry.secondTrip ? (
                        <span className="ml-1.5 rounded-full border border-brand-line bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                          2nd
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[12px] leading-relaxed text-ink-faint">
            Tap a van issue to change it or add one.
          </p>
        </>
      )}

      {editing ? (
        <IssuesSheet
          key={editing.id}
          entry={editing}
          onClose={() => setEditingId(null)}
          onSave={(text) => {
            setEditingId(null);
            setError(null);
            saveYard(nightKey, editing.id, { vanIssues: text }, uid).catch(
              (err: unknown) => {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Those van issues did not save.",
                );
              },
            );
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * One driver's van issues, on their own.
 *
 * A sheet rather than the cell itself turning into a box. The grid is 560px
 * wide inside a window half that, so an editor in the cell would be a textarea
 * a third of a phone across, sitting in something that scrolls sideways under
 * his thumb while he types. Full width, his name at the top so there is no
 * doubt whose van it is, and the same keyboard behaviour as the sheet upstairs.
 */
function IssuesSheet({
  entry,
  onSave,
  onClose,
}: {
  entry: Entry;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(entry.vanIssues);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focused and with the caret at the end, because the common case is adding
    // to what is already there rather than replacing it.
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

  return (
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
        aria-label={`Van issues for ${entry.fullName}`}
        className="animate-sheet absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface pb-safe"
      >
        <div className="mx-auto max-w-lg px-4 pb-6 pt-2.5">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong"
          />

          <h3 className="text-[18px] font-bold leading-tight tracking-tight">
            {entry.fullName}
          </h3>
          <p className="mt-0.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Van issues{entry.van ? ` · ${entry.van}` : ""}
          </p>

          <label htmlFor="summary-issues" className="sr-only">
            Van issues for {entry.fullName}
          </label>
          <textarea
            id="summary-issues"
            ref={box}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            placeholder="Anything wrong with it — leave empty if not"
            className="mt-3 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[16px] leading-snug text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
          />

          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => onSave(text.trim())}
              className="min-h-14 flex-1 text-[16px]"
            >
              Save
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
        </div>
      </div>
    </div>
  );
}

function Head({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint ${className}`}
    >
      {children}
    </th>
  );
}

/** Small enough to stay out of the way, there so the cell reads as a control. */
function Pencil() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 size-3.5 shrink-0 text-ink-faint"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

/** Empty on purpose reads differently to empty by accident. */
function Blank() {
  return (
    <span aria-label="nothing" className="text-ink-faint">
      —
    </span>
  );
}
