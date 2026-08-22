"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorNote } from "@/components/ui/Field";
import { FlagTag } from "@/components/ui/FlagToggle";
import { addCloserEntry } from "@/lib/db/closer";
import { addDriver, useDrivers } from "@/lib/db/drivers";
import { nameKey } from "@/lib/names";
import type { Entry, RosterEntry, Session } from "@/lib/types";

/**
 * A driver nobody told Karim about.
 *
 * It happens most nights — someone swaps a route, or the dispatcher was on the
 * other line when he called. The van is already in the yard, which is the only
 * reason Karim knows to add him, so picking a name puts him straight in the
 * yard and opens his sheet on the van. The clock-out is at the bottom of it,
 * exactly where it is for everyone else.
 *
 * A phone list rather than the dispatcher's combobox on purpose. There is no
 * keyboard to arrow through with, and every row here is a real tap target.
 */
export function AddDriverSheet({
  nightKey,
  session,
  entries,
  uid,
  onAdded,
  onClose,
}: {
  nightKey: string;
  session: Session;
  entries: Entry[];
  uid: string;
  /** The new entry's id, so the board can open his sheet straight away. */
  onAdded: (entryId: string) => void;
  onClose: () => void;
}) {
  const { drivers, error: driversError } = useDrivers();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The driver already on the sheet whose row he has just tapped, by id.
   *
   * Tapping a name that is already there is ambiguous in a way no other tap on
   * this screen is — he could mean the row that exists, or a second one for a
   * second trip — so it asks rather than guesses. Two taps, on the rare case,
   * to keep the common one from silently duplicating a row nobody notices
   * until the PDF.
   */
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    search.current?.focus();

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

  const key = nameKey(query);

  const rosterByDriver = useMemo(
    () => new Map(session.roster.map((row) => [row.driverId, row])),
    [session.roster],
  );

  const enteredIds = useMemo(
    () => new Set(entries.map((entry) => entry.driverId)),
    [entries],
  );

  const matches = useMemo(() => {
    const pool = (drivers ?? []).filter(
      (driver) => !key || driver.nameKey.includes(key),
    );

    return pool
      .map((driver) => ({
        driverId: driver.id,
        fullName: driver.fullName,
        nameKey: driver.nameKey,
        roster: rosterByDriver.get(driver.id),
        entered: enteredIds.has(driver.id),
      }))
      .sort((a, b) => {
        // Already on the sheet is almost never who he means, so it sinks.
        if (a.entered !== b.entered) return a.entered ? 1 : -1;
        // Then whoever was on tonight's roster.
        const onRoster = (row: { roster?: RosterEntry }) => (row.roster ? 0 : 1);
        if (onRoster(a) !== onRoster(b)) return onRoster(a) - onRoster(b);
        return a.fullName.localeCompare(b.fullName);
      })
      .slice(0, 30);
  }, [drivers, key, rosterByDriver, enteredIds]);

  const typed = query.trim().replace(/\s+/g, " ");
  const exact = (drivers ?? []).some((driver) => driver.nameKey === key);
  const canCreate = key.length > 1 && !exact;

  async function add(
    driver: {
      driverId: string;
      fullName: string;
      roster?: RosterEntry;
    },
    /** Set only from the second-trip button, which has already asked. */
    secondTrip = false,
  ) {
    if (busy) return;

    /**
     * He is already on the sheet.
     *
     * Two things this could mean, and they are far enough apart that guessing
     * is worse than asking: the row he already has, or a fresh one because he
     * went back out and came in again. So the tap opens the choice, and the
     * button he picks does the thing.
     */
    const already = entries.find((entry) => entry.driverId === driver.driverId);
    if (already && !secondTrip) {
      setAsking(driver.driverId);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const entryId = await addCloserEntry(
        nightKey,
        entries,
        { ...driver, secondTrip },
        uid,
      );
      onAdded(entryId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add him to the sheet.",
      );
      setBusy(false);
    }
  }

  /** The row he already has. Nothing is written; this only opens it. */
  function openExisting(driverId: string) {
    const already = entries.find((entry) => entry.driverId === driverId);
    if (already) onAdded(already.id);
  }

  /** A name that is not in the database yet. Create the driver, then add him. */
  async function createAndAdd() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const driverId = await addDriver(typed);
      const entryId = await addCloserEntry(
        nightKey,
        entries,
        { driverId, fullName: typed },
        uid,
      );
      onAdded(entryId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add that driver.",
      );
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
        aria-label="Add a driver to tonight's sheet"
        className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-line bg-surface pb-safe"
      >
        <div className="mx-auto w-full max-w-lg px-4 pt-2.5">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong"
          />

          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-bold leading-tight tracking-tight">
                Add a driver
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                Someone dispatch hasn&rsquo;t entered. Picking a name puts him
                in the yard and opens his van.
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

          <label htmlFor="driver-search" className="sr-only">
            Driver name
          </label>
          <input
            id="driver-search"
            ref={search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a name"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="mt-4 w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-[17px] font-medium text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-faint focus:border-brand"
          />

          {error ? (
            <div className="mt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
          {driversError ? (
            <div className="mt-3">
              <ErrorNote>Could not load the driver list: {driversError}</ErrorNote>
            </div>
          ) : null}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <ul className="mx-auto w-full max-w-lg space-y-1.5 px-4 pb-5">
            {matches.map((option) =>
              asking === option.driverId ? (
                <li key={option.driverId}>
                  {/* Opened in place, where his finger already is, rather than
                      as a dialog over the top of the list. The question is
                      about this one name and the answer is one of two taps. */}
                  <div className="rounded-xl border border-brand-line bg-brand-soft p-2.5">
                    <p className="px-1 pt-0.5 text-[13px] font-semibold leading-snug text-brand">
                      {option.fullName} is already on tonight&rsquo;s sheet.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openExisting(option.driverId)}
                        className="min-h-14 flex-1 rounded-xl border border-line bg-surface px-3 text-[14px] font-bold text-ink transition-colors active:brightness-[0.97] disabled:opacity-55"
                      >
                        Open his row
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void add(option, true)}
                        className="min-h-14 flex-1 rounded-xl bg-brand px-3 text-[14px] font-bold text-ink-inverse transition-colors active:brightness-[0.97] disabled:opacity-55"
                      >
                        Second trip
                      </button>
                    </div>
                    <p className="mt-1.5 px-1 text-[11px] leading-snug text-brand/80">
                      A second trip is a row of its own — its own van, its own
                      checks, and a time you type in.
                    </p>
                    <button
                      type="button"
                      onClick={() => setAsking(null)}
                      className="mt-1 min-h-11 w-full text-[13px] font-semibold text-brand/80"
                    >
                      Neither — go back
                    </button>
                  </div>
                </li>
              ) : (
              <li key={option.driverId}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void add(option)}
                  className="flex min-h-14 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition-colors active:brightness-[0.97] disabled:opacity-55"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">
                      {option.fullName}
                    </span>
                    {option.roster ? null : (
                      <span className="mt-0.5 block text-[11px] font-medium text-ink-faint">
                        Not on tonight&rsquo;s roster
                      </span>
                    )}
                  </span>

                  {option.roster?.isBud ? <FlagTag flag="bud" /> : null}
                  {option.roster?.isTrainer ? <FlagTag flag="trn" /> : null}
                  {option.roster?.isRescuer ? <FlagTag flag="res" /> : null}

                  {option.entered ? (
                    <span className="shrink-0 rounded-full border border-line bg-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                      On the sheet
                    </span>
                  ) : null}
                </button>
              </li>
              ),
            )}

            {canCreate ? (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  onClick={createAndAdd}
                  className="flex min-h-14 w-full items-center gap-2 rounded-xl border border-brand-line bg-brand-soft px-3.5 py-2.5 text-left transition-colors active:brightness-[0.97] disabled:opacity-55"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-brand">
                      Add &ldquo;{typed}&rdquo;
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-brand/75">
                      New name — goes in the driver database too
                    </span>
                  </span>
                </button>
              </li>
            ) : null}

            {matches.length === 0 && !canCreate ? (
              <li className="px-1 py-6 text-center text-[13px] text-ink-faint">
                {drivers === null ? "Loading drivers…" : "Nobody by that name."}
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
