"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { FlagTag } from "@/components/ui/FlagToggle";
import { useEntries } from "@/lib/db/entries";
import { saveTimeEdit } from "@/lib/db/sessions";
import { stationDateLabel } from "@/lib/constants";
import { nameKey } from "@/lib/names";
import { timeEditTargets, type TimeEditTarget } from "@/lib/timeEdits";
import type { Session } from "@/lib/types";

/**
 * Tonight's roster, and one box per name.
 *
 * The job this screen does is small and it is the only one it does: find the
 * driver, paste what changed about his hours, and have it turn up on the two
 * screens that are working the close. Nothing here can alter the night — not
 * the roster, not an ETA, not a clock-out. The rules would refuse it anyway,
 * and building a control the database is going to reject is building a lie.
 *
 * One list, not a search that returns nothing until you type. HR is
 * reconciling a shift against a roster, so seeing the roster whole — and
 * which names have already been dealt with — is most of the work. The search
 * box is for the long ones.
 */
export function TimeEditBoard({
  nightKey,
  session,
  uid,
}: {
  nightKey: string;
  session: Session;
  uid: string;
}) {
  /**
   * The entries are read purely to widen the list of names.
   *
   * A driver who turned up unannounced is on the sheet without ever having
   * been on the roster, and he was still on the clock. Nothing else on this
   * screen touches an entry — see lib/timeEdits.
   */
  const { entries } = useEntries(nightKey);
  const [query, setQuery] = useState("");
  /** The driverId whose box is open. One at a time. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const everyone = useMemo(
    () => timeEditTargets(session, entries),
    [session, entries],
  );

  const key = nameKey(query);
  const matches = useMemo(
    () => everyone.filter((row) => !key || nameKey(row.fullName).includes(key)),
    [everyone, key],
  );

  const edited = everyone.filter((row) => row.edit.trim() !== "").length;

  async function save(driverId: string, text: string) {
    setError(null);
    try {
      await saveTimeEdit(nightKey, driverId, text, uid);
      setOpenId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That time edit did not save.",
      );
      // Left open deliberately. The text is still in the box, and closing the
      // row underneath an error would be taking away the thing they just typed.
      throw err;
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bud">
            {stationDateLabel(new Date(`${nightKey}T12:00:00Z`))}
          </p>
          <h1 className="mt-1.5 text-[26px] font-bold tracking-tight">
            Time edits
          </h1>
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-muted">
            Paste what changed about a driver&rsquo;s hours. It shows on the
            dispatcher&rsquo;s sheet and on Karim&rsquo;s phone straight away.
          </p>
        </div>

        <div className="flex items-center gap-5">
          <Count label="On tonight" value={everyone.length} />
          <Count label="Edited" value={edited} accent={edited > 0} />
        </div>
      </header>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div>
        <label htmlFor="hr-search" className="sr-only">
          Find a driver on tonight&rsquo;s roster
        </label>
        <input
          id="hr-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a name"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] font-medium text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-faint focus:border-bud"
        />
      </div>

      {everyone.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center text-[14px] text-ink-faint">
          Tonight&rsquo;s roster is empty. Dispatch pastes the names in.
        </p>
      ) : matches.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-5 py-10 text-center text-[14px] text-ink-faint">
          Nobody by that name is on tonight.
        </p>
      ) : (
        <ul className="space-y-2">
          {matches.map((row) => (
            <li key={row.driverId}>
              <DriverRow
                row={row}
                open={openId === row.driverId}
                onOpen={() => {
                  setError(null);
                  setOpenId(row.driverId);
                }}
                onCancel={() => setOpenId(null)}
                onSave={(text) => save(row.driverId, text)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One name, folded shut until there is something to write.
 *
 * Closed, the row answers the only question HR is scanning this list for: has
 * this one been dealt with, and if so what does it say. Open, it is a box.
 * Editing in place rather than in a dialog because the next name is nearly
 * always the one underneath, and a modal that has to be dismissed between every
 * two drivers is a modal opened forty times a night.
 */
function DriverRow({
  row,
  open,
  onOpen,
  onCancel,
  onSave,
}: {
  row: TimeEditTarget;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const has = row.edit.trim() !== "";

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`block w-full rounded-xl border px-4 py-3 text-left transition-colors ${
          has
            ? "border-bud-line bg-bud-soft/40 hover:bg-bud-soft/70"
            : "border-line bg-surface hover:border-line-strong hover:bg-sunken/60"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            {row.fullName}
          </span>

          {row.roster?.isBud ? <FlagTag flag="bud" /> : null}
          {row.roster?.isTrainer ? <FlagTag flag="trn" /> : null}
          {row.roster?.isRescuer ? <FlagTag flag="res" /> : null}

          {/* Not on the roster at all — he turned up and Karim put him on the
              sheet. Worth saying, because HR is reconciling against a roster
              this name is not on. */}
          {!row.roster ? (
            <span className="shrink-0 rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
              Unannounced
            </span>
          ) : null}

          <span
            className={`shrink-0 text-[12px] font-semibold ${
              has ? "text-bud" : "text-ink-muted"
            }`}
          >
            {has ? "Edit" : "Add"}
          </span>
        </span>

        {/* The edit itself, in full, with its line breaks. It is pasted out of
            somebody's payroll system and it is usually two or three lines; a
            list that showed the first thirty characters of each would be a list
            HR has to open every row of to read.

            Mono, like every other time in this app and like the box it was
            typed into. It is a column of clock times as often as it is a
            sentence, and the same text is mono on the dispatcher's screen. */}
        {has ? (
          <span className="mt-2 block whitespace-pre-line border-t border-bud-line/60 pt-2 font-mono text-[12.5px] leading-relaxed text-ink">
            {row.edit}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <Editor row={row} onCancel={onCancel} onSave={onSave} />
  );
}

/**
 * The box.
 *
 * Opens with whatever is already stored, caret at the end, exactly like the
 * note editor on the other two screens. Clearing it and saving takes the edit
 * off both of them — which is the only way to withdraw one, and has to be
 * possible: an edit pasted against the wrong driver is the mistake this screen
 * makes, and it must not be permanent.
 */
function Editor({
  row,
  onCancel,
  onSave,
}: {
  row: TimeEditTarget;
  onCancel: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(row.edit);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  /**
   * Open with the caret after whatever is already there, once.
   *
   * On mount rather than on focus: putting it in an onFocus handler moved the
   * caret to the end every time the box was clicked back into, which on a
   * three-line paste someone is correcting the middle of is the field fighting
   * them.
   */
  useEffect(() => {
    const field = box.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  const dirty = text !== row.edit;
  const clearing = row.edit.trim() !== "" && text.trim() === "";

  return (
    <div className="rounded-xl border border-bud-line bg-surface p-4 shadow-[0_1px_3px_rgba(14,20,25,0.06)]">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[15px] font-bold tracking-tight">
          {row.fullName}
        </h2>
        {row.roster?.isBud ? <FlagTag flag="bud" /> : null}
        {row.roster?.isTrainer ? <FlagTag flag="trn" /> : null}
        {row.roster?.isRescuer ? <FlagTag flag="res" /> : null}
      </div>

      <label htmlFor={`time-edit-${row.driverId}`} className="sr-only">
        Time edit for {row.fullName}
      </label>
      <textarea
        id={`time-edit-${row.driverId}`}
        ref={box}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        rows={4}
        placeholder="Paste the time edit"
        /* resize-y and a real minimum: a three-line paste must not land in a
           one-line slot, and a long one has to be draggable open. */
        className="mt-3 min-h-28 w-full resize-y rounded-lg border border-line-strong bg-surface px-3.5 py-3 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:font-sans placeholder:text-ink-faint focus:border-bud"
      />

      <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
        {clearing
          ? "Saving an empty box takes the time edit off both screens."
          : row.edit.trim()
            ? "There is already an edit on him. This replaces it."
            : "Pasted exactly as you type it, line breaks and all."}
      </p>

      <div className="mt-3 flex gap-2">
        <Button
          variant={clearing ? "secondary" : "primary"}
          loading={busy}
          disabled={!dirty}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(text.trim());
            } catch {
              // The board is showing the reason. The box stays as it is.
            } finally {
              setBusy(false);
            }
          }}
        >
          {clearing ? "Remove the time edit" : "Save"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Count({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
          accent ? "text-bud" : "text-ink-faint"
        }`}
      >
        {label}
      </p>
      <p
        className={`tnum mt-0.5 font-mono text-[18px] font-bold tracking-tight ${
          accent ? "text-bud" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
