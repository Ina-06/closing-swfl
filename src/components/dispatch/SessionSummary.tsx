"use client";

import { Button } from "@/components/ui/Button";
import { stationDateLabel } from "@/lib/constants";
import type { Session } from "@/lib/types";

const STATUS_LABEL: Record<Session["status"], string> = {
  open: "Open",
  allReturning: "All returning",
  closed: "Closed",
};

/**
 * Tonight, once the roster exists. Phase 3 puts the entry form above this and
 * the live table below it; for now it is the proof that the session is real.
 */
export function SessionSummary({
  session,
  nightKey,
  onEditRoster,
}: {
  session: Session;
  nightKey: string;
  onEditRoster: () => void;
}) {
  const buds = session.roster.filter((driver) => driver.isBud).length;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand">
              {stationDateLabel(new Date(`${nightKey}T12:00:00Z`))}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              Tonight&rsquo;s roster
            </h1>
          </div>
          <span className="rounded-full border border-arrived-line bg-arrived-soft px-2.5 py-1 text-[11px] font-semibold text-arrived">
            {STATUS_LABEL[session.status]}
          </span>
        </header>

        <dl className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-4">
          <Stat label="Expected" value={String(session.totalExpected)} mono />
          <Stat label="BUDs" value={String(buds)} mono />
          <Stat label="Wave" value={session.wave || "—"} />
          <Stat label="Managed by" value={session.managedBy || "—"} />
        </dl>

        <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto">
          {session.roster.map((driver, index) => (
            <li
              key={driver.driverId}
              className="flex items-center gap-3 px-5 py-2.5 sm:px-7"
            >
              <span className="tnum w-6 shrink-0 text-right font-mono text-[12px] text-ink-faint">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                {driver.fullName}
              </span>
              {driver.isBud ? (
                <span className="shrink-0 rounded-full border border-bud-line bg-bud-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bud">
                  BUD
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="border-t border-line px-5 py-4 sm:px-7">
          <Button variant="secondary" onClick={onEditRoster}>
            Edit the roster
          </Button>
        </div>
      </section>

      <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
        Phase 3 adds the per-driver entry form and the live table here — ETA,
        returns, performance, metric, infractions and rescues.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-5 py-4 sm:px-7">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate text-[18px] font-bold tracking-tight ${mono ? "tnum font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
