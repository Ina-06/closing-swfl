"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CHECK_LABELS, CheckCycle, type Check } from "@/components/ui/Checks";
import { ErrorNote } from "@/components/ui/Field";
import { FlagTag } from "@/components/ui/FlagToggle";
import { flagsOn } from "@/components/closer/DriverCard";
import {
  correctClockOut,
  markArrived,
  reopenEntry,
  saveYard,
  type YardFields,
} from "@/lib/db/closer";
import {
  stationInstant,
  stationTimeInputValue,
  stationTimeLabel,
} from "@/lib/constants";
import { lateLabel } from "@/lib/eta";
import type { Entry } from "@/lib/types";

/**
 * The sheet behind a card — one driver's whole record.
 *
 * It is ordered by when Karim needs each part. The arrival decision is at the
 * top and is the biggest thing on the screen, because that is what he opened
 * this for. The van, its issues and the three checks come next, because that is
 * what he does while standing at it. What the dispatcher already knows is at
 * the bottom, read-only, because it is reference rather than work.
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

  /**
   * The van fields save themselves as he types, so they never go through `run`
   * — a spinner on the Arrived button because someone typed a digit into the
   * van number would be nonsense. Failures surface in the same error line.
   */
  const writeYard = useCallback(
    (fields: YardFields) => {
      saveYard(nightKey, entry.id, fields, uid).catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "The van details did not save.",
        );
      });
    },
    [nightKey, entry.id, uid],
  );

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
        <div className="mx-auto max-w-lg px-4 pb-6 pt-2.5">
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

          {/* Only once he is in. Karim records the van with it in front of him,
              so on a driver still out these fields are five controls he cannot
              use standing between him and the one he can. */}
          {arrived ? <VanPanel entry={entry} onSave={writeYard} /> : null}

          <FromDispatch entry={entry} />
        </div>
      </div>
    </div>
  );
}

/**
 * What Karim fills in at the van.
 *
 * Nothing here has a Save button. Every field writes itself a beat after he
 * stops typing, and again the moment it loses focus or the sheet closes, so
 * there is no state in which what is on the screen is not what is in the
 * database.
 */
function VanPanel({
  entry,
  onSave,
}: {
  entry: Entry;
  onSave: (fields: YardFields) => void;
}) {
  const van = useSavedField(entry.van, (value) => onSave({ van: value.trim() }));
  const issues = useSavedField(entry.vanIssues, (value) =>
    onSave({ vanIssues: value.trim() }),
  );

  const checks: [string, Check, (next: Check) => void][] = [
    [CHECK_LABELS[0], entry.cell, (cell) => onSave({ cell })],
    [CHECK_LABELS[1], entry.key, (key) => onSave({ key })],
    [CHECK_LABELS[2], entry.fuel, (fuel) => onSave({ fuel })],
  ];

  return (
    <section className="mt-6">
      <SectionTitle>The van</SectionTitle>

      <label htmlFor="van" className="sr-only">
        Van number for {entry.fullName}
      </label>
      <input
        id="van"
        value={van.value}
        onChange={(event) => van.change(event.target.value)}
        onBlur={van.flush}
        /* Van numbers carry letters as often as digits, so this stays a full
           keyboard — but capitalised, because that is how they are painted on
           the side of the van and how they end up on the sheet. */
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="Van number"
        className="tnum mt-2 w-full rounded-xl border border-line-strong bg-surface px-4 py-3.5 text-center font-mono text-[26px] font-bold tracking-wide text-ink outline-none transition-colors placeholder:text-[17px] placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-ink-faint focus:border-brand"
      />

      <div className="mt-2.5 flex gap-2">
        {checks.map(([label, value, set]) => (
          <CheckCycle key={label} label={label} value={value} onChange={set} />
        ))}
      </div>

      <label
        htmlFor="van-issues"
        className="mt-4 block text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
      >
        Van issues
      </label>
      <textarea
        id="van-issues"
        value={issues.value}
        onChange={(event) => issues.change(event.target.value)}
        onBlur={issues.flush}
        rows={2}
        placeholder="Anything wrong with it — leave empty if not"
        className="mt-1.5 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[16px] leading-snug text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
      />
    </section>
  );
}

/**
 * The dispatcher's half, read-only.
 *
 * Karim needs to see it — a driver with three returns is a driver he is about
 * to have a conversation with — but it is not his to change, and the rules
 * would refuse the write anyway. Showing it flat rather than as disabled inputs
 * is the honest rendering: these are facts, not controls someone switched off.
 */
function FromDispatch({ entry }: { entry: Entry }) {
  const rescues =
    entry.rescues > 0
      ? `${entry.rescues} given`
      : entry.rescues < 0
        ? `${Math.abs(entry.rescues)} received`
        : "None";

  const blank =
    !entry.returnsRaw.trim() && !entry.infractions.trim() && entry.rescues === 0;

  return (
    <section className="mt-6">
      <SectionTitle>From dispatch</SectionTitle>

      {blank ? (
        <p className="mt-2 rounded-xl border border-dashed border-line-strong bg-sunken/50 px-3.5 py-3 text-[13px] leading-relaxed text-ink-faint">
          {entry.addedByCloser
            ? "Nothing yet — you added him, so dispatch fills this in afterwards."
            : "Nothing entered for him yet."}
        </p>
      ) : (
        <dl className="mt-2 divide-y divide-line rounded-xl border border-line bg-sunken/50">
          <Row term="Returns" value={entry.returnsRaw.trim() || "None"} />
          <Row term="Infractions" value={entry.infractions.trim() || "None"} />
          <Row term="Rescues" value={rescues} />
        </dl>
      )}
    </section>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex gap-3 px-3.5 py-2.5">
      <dt className="w-[86px] shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {term}
      </dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-snug text-ink">
        {value}
      </dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
      {children}
    </h3>
  );
}

/**
 * A text field that saves itself.
 *
 * Never lose typed text is a rule for this whole app, and a phone sheet is
 * where it is easiest to break: he types half a van number and the screen goes
 * off, or his thumb catches the backdrop. So writes settle 700ms after the last
 * keystroke, and anything still pending is flushed on blur and again when the
 * sheet unmounts.
 *
 * The drafts start from the entry and are never re-synced, which is safe
 * because the sheet is keyed by driver — a different driver is a different
 * component — and because the rules make the closer the only writer of these
 * fields.
 */
function useSavedField(initial: string, save: (next: string) => void) {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = useRef({ typed: initial, written: initial, save });

  useEffect(() => {
    state.current.save = save;
  });

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const current = state.current;
    if (current.typed.trim() === current.written.trim()) return;
    current.written = current.typed;
    current.save(current.typed);
  }, []);

  useEffect(() => flush, [flush]);

  function change(next: string) {
    setValue(next);
    state.current.typed = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }

  return { value, change, flush };
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
