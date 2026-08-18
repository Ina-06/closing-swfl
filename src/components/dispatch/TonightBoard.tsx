"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { AllReturning } from "@/components/dispatch/AllReturning";
import { EntriesTable } from "@/components/dispatch/EntriesTable";
import { EntryForm } from "@/components/dispatch/EntryForm";
import { useEntries } from "@/lib/db/entries";
import { stationDateLabel } from "@/lib/constants";
import type { Driver, Session } from "@/lib/types";

const STATUS_LABEL: Record<Session["status"], string> = {
  open: "Open",
  allReturning: "All returning",
  closed: "Closed",
};

/**
 * The dispatcher's screen for the whole night: enter a driver as he calls in,
 * watch the sheet fill up, fix anything that changes.
 */
export function TonightBoard({
  nightKey,
  session,
  drivers,
  uid,
  onEditRoster,
}: {
  nightKey: string;
  session: Session;
  drivers: Driver[];
  uid: string;
  onEditRoster: () => void;
}) {
  const { entries, error } = useEntries(nightKey);

  const enteredIds = useMemo(
    () => new Set(entries.map((entry) => entry.driverId)),
    [entries],
  );

  const waiting = session.roster.filter((row) => !enteredIds.has(row.driverId));
  const arrived = entries.filter((entry) => entry.status === "arrived").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand">
            {stationDateLabel(new Date(`${nightKey}T12:00:00Z`))}
          </p>
          <h1 className="mt-1.5 text-[26px] font-bold tracking-tight">
            Tonight&rsquo;s sheet
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Managed by {session.managedBy || "—"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Count label="Entered" value={entries.length} of={session.totalExpected} />
          <Count label="Arrived" value={arrived} of={entries.length} />
          <span className="rounded-full border border-arrived-line bg-arrived-soft px-2.5 py-1 text-[11px] font-semibold text-arrived">
            {STATUS_LABEL[session.status]}
          </span>
        </div>
      </header>

      {error ? (
        <ErrorNote>Could not reach tonight&rsquo;s sheet: {error}</ErrorNote>
      ) : null}

      <EntryForm
        nightKey={nightKey}
        session={session}
        entries={entries}
        drivers={drivers}
        uid={uid}
      />

      {waiting.length > 0 ? (
        <section className="rounded-xl border border-line bg-surface px-5 py-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Still to call in · {waiting.length}
          </h2>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {waiting.map((row) => (
              <li
                key={row.driverId}
                className="rounded-full border border-line bg-sunken px-2.5 py-1 text-[12px] font-medium text-ink-muted"
              >
                {row.fullName}
              </li>
            ))}
          </ul>
        </section>
      ) : session.roster.length > 0 ? (
        <p className="rounded-xl border border-arrived-line bg-arrived-soft px-5 py-3 text-[13px] font-semibold text-arrived">
          Everyone on the roster is on the sheet.
        </p>
      ) : null}

      <EntriesTable nightKey={nightKey} entries={entries} uid={uid} />

      <AllReturning
        nightKey={nightKey}
        session={session}
        entries={entries}
        uid={uid}
      />

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button variant="secondary" onClick={onEditRoster}>
          Edit the roster
        </Button>
        <span className="text-[12px] text-ink-faint">
          End Day and the PDF arrive in Phase 7.
        </span>
      </div>
    </div>
  );
}

function Count({
  label,
  value,
  of,
}: {
  label: string;
  value: number;
  of: number;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </p>
      <p className="tnum mt-0.5 font-mono text-[18px] font-bold tracking-tight">
        {value}
        <span className="text-ink-faint">/{of}</span>
      </p>
    </div>
  );
}
