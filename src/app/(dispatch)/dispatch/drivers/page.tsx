"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorNote, Label, TextInput } from "@/components/ui/Field";
import {
  addDriver,
  deleteDriver,
  renameDriver,
  useDrivers,
} from "@/lib/db/drivers";
import { nameKey } from "@/lib/names";
import type { Driver } from "@/lib/types";

/**
 * The driver database: names, and nothing else.
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
    <div className="space-y-5">
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
            Names only. BUD, TRN and RES are set on tonight&rsquo;s roster.
          </p>
        </div>
        <p className="tnum font-mono text-[12px] text-ink-muted">
          {drivers?.length ?? 0} drivers
        </p>
      </div>

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
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-medium text-ink outline-none transition-colors hover:border-line focus:border-brand focus:bg-surface"
      />

      {dirty ? (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-warn">
          Unsaved
        </span>
      ) : null}

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
