"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { FlagTag } from "@/components/ui/FlagToggle";
import { saveNote } from "@/lib/db/closer";
import { saveRosterNote } from "@/lib/db/sessions";
import { nameKey } from "@/lib/names";
import { pendingNote } from "@/lib/notes";
import type { Entry, RosterEntry, Session } from "@/lib/types";

/**
 * A note Karim leaves himself, for when the van pulls in.
 *
 * The dispatcher has had this since the beginning and it is the most useful
 * thing on the card: an amber strip that appears the moment the driver is on
 * screen. Half of what needs saying, though, is only known in the yard — take
 * his badge off him, the ramp is jammed, ask him about the third stop — and
 * until now the only way to keep it was in his head, at eleven at night, with
 * nine vans still out.
 *
 * So it writes the same field. One note per driver, one amber strip, whoever
 * wrote it. The editor opens with what is already there so his goes underneath
 * the dispatcher's rather than over it.
 *
 * Two screens in one sheet, because that is the shape of the job: find the name,
 * then say the thing.
 */
export function NoteSheet({
  nightKey,
  session,
  entries,
  uid,
  onClose,
}: {
  nightKey: string;
  session: Session;
  entries: Entry[];
  uid: string;
  onClose: () => void;
}) {
  /** The row he is writing about, or null while he is still looking for it. */
  const [picked, setPicked] = useState<Target | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const everyone = useTonight(session, entries);

  const key = nameKey(query);
  const matches = useMemo(
    () => everyone.filter((row) => !key || nameKey(row.fullName).includes(key)),
    [everyone, key],
  );

  /**
   * Write it, whether or not there is a row to write it on.
   *
   * A name off tonight's roster that dispatch has not entered has no document
   * behind it, and that is exactly the driver Karim most wants to leave himself
   * a note about — nobody has heard from him yet.
   *
   * It does *not* make him a row. A row is what "dispatch has heard from him"
   * means: it takes his name off their still-to-call-in list, it stops him
   * being dashed on this screen, and when the dispatcher then enters him
   * properly it would put a second row on the sheet under one name. So the note
   * waits on the session instead, and moves onto his row the moment there is
   * one — see lib/notes.
   */
  async function save(text: string) {
    if (busy || !picked) return;
    setBusy(true);
    setError(null);

    try {
      // Which of the two places it goes is decided by whether he has a row,
      // and by nothing else.
      if (picked.entry) {
        await saveNote(nightKey, picked.entry.id, text, uid);
      } else {
        await saveRosterNote(nightKey, picked.driverId, text, uid);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That note did not save.");
      setBusy(false);
    }
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
        role="dialog"
        aria-modal="true"
        aria-label={picked ? `Note for ${picked.fullName}` : "Add a note"}
        className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-line bg-surface pb-safe"
      >
        <div className="mx-auto w-full max-w-lg px-4 pt-2.5">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong"
          />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold leading-tight tracking-tight">
                {picked ? picked.fullName : "Add a note"}
              </h2>
              <p className="mt-1 text-[13px] leading-snug text-ink-muted">
                {!picked
                  ? "Pick a driver. The note pops up on his card the moment he is back."
                  : picked.entry
                    ? "It shows on his card and at the top of his sheet when he comes in."
                    : "Nobody has entered him yet. The note sits on his card and stays with him when dispatch does."}
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

          {error ? (
            <div className="mt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
        </div>

        {picked ? (
          <NoteEditor
            key={picked.key}
            target={picked}
            busy={busy}
            onSave={(text) => void save(text)}
            onBack={() => {
              setError(null);
              setPicked(null);
            }}
          />
        ) : (
          <>
            <div className="mx-auto w-full max-w-lg px-4">
              <label htmlFor="note-search" className="sr-only">
                Find a driver
              </label>
              {/* Not focused on open. The list is tonight's wave and the name he
                  wants is usually on the first screen of it — raising the
                  keyboard would push it off. */}
              <input
                id="note-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a name"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-4 w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-[17px] font-medium text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-faint focus:border-brand"
              />
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <ul className="mx-auto w-full max-w-lg space-y-1.5 px-4 pb-5">
                {matches.map((row) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => setPicked(row)}
                      className="flex min-h-14 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition-colors active:brightness-[0.97]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate text-[16px] font-semibold">
                            {row.fullName}
                          </span>
                          {/* Two rows under one name. Without this he cannot
                              tell which trip he is writing about. */}
                          {row.entry?.secondTrip ? (
                            <span className="shrink-0 rounded-full border border-brand-line bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                              2nd
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-ink-faint">
                          {whereHeIs(row)}
                        </span>
                      </span>

                      {row.roster?.isBud ? <FlagTag flag="bud" /> : null}
                      {row.roster?.isTrainer ? <FlagTag flag="trn" /> : null}
                      {row.roster?.isRescuer ? <FlagTag flag="res" /> : null}

                      {/* He has one already. Tapping adds to it rather than
                          starting again, and this is what says so before he
                          taps. */}
                      {row.note.trim() ? (
                        <span className="shrink-0 rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
                          Note
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}

                {matches.length === 0 ? (
                  <li className="px-1 py-6 text-center text-[13px] text-ink-faint">
                    {everyone.length === 0
                      ? "Nobody on tonight's sheet yet."
                      : "Nobody by that name tonight."}
                  </li>
                ) : null}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Somebody he can write a note about — a row on the sheet, or a name on the
 * roster that has not become one yet.
 *
 * Both are on this list because from where Karim is standing they are the same
 * thing: a driver who is out and coming back. Whether dispatch has typed him in
 * yet is not something he should have to know before he can leave himself a
 * note.
 */
type Target = {
  key: string;
  driverId: string;
  fullName: string;
  roster?: RosterEntry;
  /** Whatever is already written about him, from wherever it is stored. */
  note: string;
  /** Absent exactly when nobody has entered him yet. */
  entry?: Entry;
};

/** Everyone on tonight, in one alphabet, rows and roster names together. */
function useTonight(session: Session, entries: Entry[]): Target[] {
  return useMemo(() => {
    const rosterByDriver = new Map(
      session.roster.map((row) => [row.driverId, row]),
    );
    const entered = new Set(entries.map((entry) => entry.driverId));

    const rows: Target[] = [
      ...entries.map((entry) => ({
        key: entry.id,
        driverId: entry.driverId,
        fullName: entry.fullName,
        roster: rosterByDriver.get(entry.driverId),
        note: entry.notes,
        entry,
      })),
      ...session.roster
        .filter((row) => !entered.has(row.driverId))
        .map((row) => ({
          key: `roster:${row.driverId}`,
          driverId: row.driverId,
          fullName: row.fullName,
          roster: row,
          note: pendingNote(session, row.driverId),
        })),
    ];

    return rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [session, entries]);
}

/**
 * Where this driver is, in three words.
 *
 * On the row because the same name can be on this list twice — a second trip —
 * and because a note is worth different amounts depending: on a driver still
 * out it will be waiting for him, on one already clocked out it is a record
 * rather than a reminder.
 */
function whereHeIs(row: Target): string {
  const entry = row.entry;
  if (!entry) return "Still out · dispatch hasn't entered him";
  if (entry.status === "arrived") return "In the yard";
  if (entry.status === "clockedOut") return "Clocked out";
  return entry.eta.trim() ? `Returning · ${entry.eta}` : "Still out";
}

/**
 * The note itself.
 *
 * Opens with whatever is already on the record, caret at the end. That is what
 * makes one shared field safe: the dispatcher's line is in front of him, so
 * adding to it is the natural thing to do and wiping it has to be deliberate.
 */
function NoteEditor({
  target,
  busy,
  onSave,
  onBack,
}: {
  target: Target;
  busy: boolean;
  onSave: (text: string) => void;
  onBack: () => void;
}) {
  const existing = target.note;
  const [text, setText] = useState(existing);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = box.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  return (
    <div className="mx-auto w-full max-w-lg overflow-y-auto px-4 pb-6">
      <label htmlFor="driver-note" className="sr-only">
        Note for {target.fullName}
      </label>
      <textarea
        id="driver-note"
        ref={box}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="What you need to remember when he pulls in"
        className="mt-4 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[16px] leading-snug text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
      />

      {existing.trim() ? (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
          There was already a note on him. Add to it — clearing the box takes it
          off.
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          size="lg"
          loading={busy}
          onClick={() => onSave(text.trim())}
          className="min-h-14 flex-1 text-[16px]"
        >
          Save note
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={busy}
          onClick={onBack}
          className="min-h-14"
        >
          Back
        </Button>
      </div>
    </div>
  );
}
