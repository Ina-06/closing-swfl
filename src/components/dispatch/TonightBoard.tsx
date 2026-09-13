"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { AllReturning } from "@/components/dispatch/AllReturning";
import { EntriesTable } from "@/components/dispatch/EntriesTable";
import { EntryForm } from "@/components/dispatch/EntryForm";
import { TimeEdits } from "@/components/dispatch/TimeEdits";
import { useEntries } from "@/lib/db/entries";
import { reopenSession } from "@/lib/db/sessions";
import { stationDateLabel, stationTimeLabel } from "@/lib/constants";
import { nightTotals } from "@/lib/totals";
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
  const [reopening, setReopening] = useState(false);

  const enteredIds = useMemo(
    () => new Set(entries.map((entry) => entry.driverId)),
    [entries],
  );

  const waiting = session.roster.filter((row) => !enteredIds.has(row.driverId));
  const arrived = entries.filter(
    (entry) => entry.status === "clockedOut",
  ).length;

  /** The same two figures Karim has at the top of his phone — see lib/totals. */
  const totals = useMemo(() => nightTotals(entries), [entries]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
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

        {/* The middle of the header, between who the night belongs to and what
            state it is in. Two of these count drivers and two count what the
            drivers brought back with them, so a rule separates the pairs —
            they are read for different reasons and should not run together as
            four numbers in a row. */}
        <div className="flex flex-wrap items-center gap-4">
          <Count label="Entered" value={entries.length} of={session.totalExpected} />
          <Count label="Arrived" value={arrived} of={entries.length} />
          <span aria-hidden="true" className="h-8 w-px bg-line" />
          <Count label="Returns" value={totals.returns} />
          <Count label="Infractions" value={totals.infractions} warn />
        </div>

        <span className="rounded-full border border-arrived-line bg-arrived-soft px-2.5 py-1 text-[11px] font-semibold text-arrived">
          {STATUS_LABEL[session.status]}
        </span>
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

      {/* Directly above the sheet it annotates, and below the still-to-call-in
          list — an edit can land against a name in either of them. */}
      <TimeEdits session={session} entries={entries} />

      <EntriesTable
        nightKey={nightKey}
        session={session}
        entries={entries}
        uid={uid}
      />

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

        {session.status === "closed" ? (
          <>
            {/* Karim closed it, and he is not in the room. A driver turning up
                after End Day should not mean the night is finished with him. */}
            <Button
              variant="ghost"
              loading={reopening}
              onClick={async () => {
                setReopening(true);
                try {
                  await reopenSession(nightKey, uid);
                } finally {
                  setReopening(false);
                }
              }}
            >
              Reopen the night
            </Button>
            <span className="text-[12px] text-ink-faint">
              Closed at{" "}
              {session.closedAt
                ? stationTimeLabel(session.closedAt.toDate())
                : "—"}
              . Reopening keeps everything on it.
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One figure in the header.
 *
 * `of` is optional because the two kinds of number here are genuinely
 * different. Entered and Arrived are fractions of a known total — the
 * denominator is the point of them. Returns and infractions are counts of
 * things that happened, and there is no number they are out of.
 */
function Count({
  label,
  value,
  of,
  warn = false,
}: {
  label: string;
  value: number;
  of?: number;
  /** Amber once it is above nought. A warning colour on a nought is noise. */
  warn?: boolean;
}) {
  const loud = warn && value > 0;

  return (
    <div>
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
          loud ? "text-warn" : "text-ink-faint"
        }`}
      >
        {label}
      </p>
      <p
        className={`tnum mt-0.5 font-mono text-[18px] font-bold tracking-tight ${
          loud ? "text-warn" : ""
        }`}
      >
        {value}
        {of === undefined ? null : <span className="text-ink-faint">/{of}</span>}
      </p>
    </div>
  );
}
