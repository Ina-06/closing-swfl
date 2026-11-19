"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorNote, Label, TextInput } from "@/components/ui/Field";
import { ScorecardPicker } from "@/components/ui/Scorecard";
import {
  addDriver,
  deleteDriver,
  renameDriver,
  setScorecard,
  setScorecardWeek,
  useDrivers,
  useScorecardWeek,
} from "@/lib/db/drivers";
import { useAuth } from "@/lib/auth/AuthProvider";
import { nameKey } from "@/lib/names";
import type { Driver } from "@/lib/types";

/**
 * The driver database: names, and each driver's last scorecard.
 *
 * The scorecard is here and not on the roster because it is about the person
 * — it holds until the next card comes out — and it is what the closer's phone
 * shows as a metal bubble on his sheet.
 *
 * BUD, TRN and RES are not here on purpose — they describe a night, not a
 * person, so they are set on the roster. Deleting is safe because the session
 * roster and every entry carry their own copy of the name: a sheet already
 * written reads the same after the driver is gone.
 */
export default function DriversPage() {
  const { drivers, loading, error } = useDrivers();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!drivers) return [];
    const key = nameKey(search);
    return key ? drivers.filter((driver) => driver.nameKey.includes(key)) : drivers;
  }, [drivers, search]);

  const duplicate = drivers?.some(
    (driver) => driver.nameKey === nameKey(newName),
  );

  async function submitNew() {
    const name = newName.trim();
    if (!name || duplicate) return;

    setAdding(true);
    setActionError(null);
    try {
      await addDriver(name);
      setNewName("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not add that driver.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/dispatch"
            className="text-[13px] font-semibold text-brand hover:underline"
          >
            ← Tonight
          </Link>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight">
            Driver database
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Names and last scorecard. BUD, TRN and RES are set on
            tonight&rsquo;s roster.
          </p>
        </div>
        <p className="tnum font-mono text-[12px] text-ink-muted">
          {drivers?.length ?? 0} drivers
        </p>
      </div>

      <ScorecardWeek onError={setActionError} />

      <section className="rounded-xl border border-line bg-surface p-5">
        <Label htmlFor="new-driver">Add a driver</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          <TextInput
            id="new-driver"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitNew();
              }
            }}
            placeholder="Full name, as it should read on the sheet"
            className="min-w-56 flex-1"
          />
          <Button
            variant="primary"
            onClick={submitNew}
            loading={adding}
            disabled={!newName.trim() || duplicate}
          >
            Add
          </Button>
        </div>
        {duplicate ? (
          <p className="mt-2 text-[13px] text-ink-muted">
            Already in the database.
          </p>
        ) : null}
      </section>

      {error ? <ErrorNote>Could not reach the database: {error}</ErrorNote> : null}
      {actionError ? <ErrorNote>{actionError}</ErrorNote> : null}

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search drivers"
          />
        </div>

        {loading ? (
          <div className="h-40 animate-pulse bg-sunken/60" aria-busy="true" />
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-ink-muted">
            {drivers?.length
              ? "No driver matches that."
              : "No drivers yet. Add one above, or paste tonight's roster and add them from there."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((driver) => (
              <DriverRow
                key={driver.id}
                driver={driver}
                onError={setActionError}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DriverRow({
  driver,
  onError,
}: {
  driver: Driver;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(driver.fullName);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = name.trim() !== driver.fullName && name.trim().length > 0;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      onError(err instanceof Error ? err.message : "That change did not save.");
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (dirty) void run(() => renameDriver(driver.id, name));
          else setName(driver.fullName);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setName(driver.fullName);
            event.currentTarget.blur();
          }
        }}
        aria-label={`Name for ${driver.fullName}`}
        spellCheck={false}
        disabled={busy}
        className="min-w-0 flex-1 basis-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[15px] sm:basis-0 font-medium text-ink outline-none transition-colors hover:border-line focus:border-brand focus:bg-surface"
      />

      {dirty ? (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-warn">
          Unsaved
        </span>
      ) : null}

      {/* Saves on the click, like the arrows on tonight's table. No busy
          state: Firestore shows the change locally before it lands, and a
          refused write comes back through onError. */}
      <ScorecardPicker
        value={driver.scorecard}
        label={`Last scorecard for ${driver.fullName}`}
        onChange={(scorecard) => {
          setScorecard(driver.id, scorecard).catch((err: unknown) =>
            onError(
              err instanceof Error ? err.message : "That scorecard did not save.",
            ),
          );
        }}
      />

      {/* Pushes Delete to the far edge, on its own line under the name on a
          phone and beside the picker on a laptop. */}
      <span aria-hidden="true" className="flex-1 sm:hidden" />

      {/* Two taps, inline. Deleting is permanent, but it is also a five-second
          fix — retyping a name — so this never becomes a modal. */}
      {confirming ? (
        <>
          <span className="text-[12px] font-semibold text-overdue">Delete?</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => deleteDriver(driver.id))}
            className="border-overdue-line text-overdue hover:border-overdue hover:bg-overdue-soft"
          >
            Yes, delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Delete
        </Button>
      )}
    </li>
  );
}

/**
 * The week the scorecards below are for. One number for the whole database —
 * the closer's phone shows it inside every bubble ("Bronze · Wk 43").
 *
 * Saves on blur or Enter, like a driver's name. Empty clears it.
 */
function ScorecardWeek({ onError }: { onError: (message: string) => void }) {
  const auth = useAuth();
  const uid = auth.status === "signedIn" ? auth.uid : "";
  const { week, loading, error } = useScorecardWeek();
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState<number | null | undefined>(undefined);

  // Follow the saved value whenever it changes (here or on another laptop).
  if (!loading && seen !== week) {
    setSeen(week);
    setDraft(week === null ? "" : String(week));
  }

  const saved = week === null ? "" : String(week);
  const dirty = draft.trim() !== saved;

  function save() {
    const trimmed = draft.trim();
    if (trimmed === saved) return;
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isInteger(next) || next < 1 || next > 53)) {
      onError("The week is a number from 1 to 53.");
      setDraft(saved);
      return;
    }
    setScorecardWeek(next, uid).catch((err: unknown) =>
      onError(err instanceof Error ? err.message : "The week did not save."),
    );
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-5">
      <div>
        <Label htmlFor="scorecard-week">Scorecard week</Label>
        <p className="mt-1 text-[13px] text-ink-muted">
          The week these scorecards are for. Shows in every bubble on the
          closer&rsquo;s phone.
        </p>
        {error ? (
          <p className="mt-1 text-[12px] text-overdue">
            Could not read the week: {error}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold text-ink-muted">Week</span>
        <input
          id="scorecard-week"
          inputMode="numeric"
          value={draft}
          disabled={loading}
          onChange={(event) =>
            setDraft(event.target.value.replace(/\D/g, "").slice(0, 2))
          }
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(saved);
              event.currentTarget.blur();
            }
          }}
          placeholder="—"
          className="tnum h-12 w-20 rounded-lg border border-line-strong bg-surface text-center font-mono text-[20px] font-bold text-ink outline-none transition-colors focus:border-brand disabled:opacity-60"
        />
        {dirty ? (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-warn">
            Unsaved
          </span>
        ) : null}
      </div>
    </section>
  );
}
