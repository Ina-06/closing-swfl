"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BudToggle } from "@/components/ui/BudToggle";
import { Button } from "@/components/ui/Button";
import { ErrorNote, Label, TextInput } from "@/components/ui/Field";
import {
  addDriver,
  renameDriver,
  setDriverActive,
  setDriverBudDefault,
  useDrivers,
} from "@/lib/db/drivers";
import { nameKey } from "@/lib/names";
import type { Driver } from "@/lib/types";

/**
 * The driver database. Add, rename, deactivate — no delete.
 *
 * Old sheets keep their own copy of every name, so renaming someone here only
 * affects nights from here on. Deactivating keeps them out of the roster
 * without erasing the fact that they used to close.
 */
export default function DriversPage() {
  const { drivers, loading, error } = useDrivers();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!drivers) return [];
    const key = nameKey(search);
    return drivers.filter(
      (driver) =>
        (showInactive || driver.active) &&
        (!key || driver.nameKey.includes(key)),
    );
  }, [drivers, search, showInactive]);

  const inactiveCount = drivers?.filter((driver) => !driver.active).length ?? 0;
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
        </div>
        <p className="tnum font-mono text-[12px] text-ink-muted">
          {drivers?.filter((driver) => driver.active).length ?? 0} active
          {inactiveCount > 0 ? ` · ${inactiveCount} deactivated` : ""}
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
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search drivers"
            className="min-w-40 flex-1"
          />
          {inactiveCount > 0 ? (
            <Button
              size="sm"
              variant={showInactive ? "secondary" : "ghost"}
              onClick={() => setShowInactive((current) => !current)}
            >
              {showInactive ? "Hide" : "Show"} deactivated
            </Button>
          ) : null}
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
  const [busy, setBusy] = useState(false);

  const dirty = name.trim() !== driver.fullName && name.trim().length > 0;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      onError(err instanceof Error ? err.message : "That change did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${driver.active ? "" : "bg-sunken/50"}`}
    >
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
        className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-medium outline-none transition-colors hover:border-line focus:border-brand focus:bg-surface ${
          driver.active ? "text-ink" : "text-ink-faint line-through"
        }`}
      />

      {dirty ? (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-warn">
          Unsaved
        </span>
      ) : null}

      <BudToggle
        size="sm"
        on={driver.isBudDefault}
        label={`${driver.fullName} default`}
        onChange={(next) => run(() => setDriverBudDefault(driver.id, next))}
      />

      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => run(() => setDriverActive(driver.id, !driver.active))}
      >
        {driver.active ? "Deactivate" : "Reactivate"}
      </Button>
    </li>
  );
}
