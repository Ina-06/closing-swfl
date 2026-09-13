"use client";

import { useMemo } from "react";
import { timeEditTargets } from "@/lib/timeEdits";
import type { Entry, Session } from "@/lib/types";

/**
 * Time edits against drivers who are not on the sheet yet.
 *
 * Every driver who has a row carries his own edit in the Time edit column of
 * the table below, beside his note, which is where the dispatcher reads it.
 * This panel is the remainder: HR writes hours before the wave is back, and a
 * driver nobody has heard from has no row for the column to sit on.
 *
 * So it is deliberately not a summary of all of them. It used to be, and that
 * meant the same paste appeared twice on one screen — once here and once on
 * his row — which is how a dispatcher learns to stop reading the panel.
 *
 * Nothing at all when there are none, which is most of the time. A panel that
 * says "no time edits" every evening is a panel nobody looks at on the night
 * there is one.
 */
export function TimeEdits({
  session,
  entries,
}: {
  session: Session;
  entries: Entry[];
}) {
  const waiting = useMemo(
    () =>
      timeEditTargets(session, entries).filter(
        (row) => row.edit.trim() !== "" && !row.entered,
      ),
    [session, entries],
  );

  if (waiting.length === 0) return null;

  return (
    <section className="rounded-xl border border-bud-line bg-bud-soft/40 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-bud">
          Time edits · {waiting.length} not on the sheet yet
        </h2>
        <p className="text-[12px] text-ink-muted">
          These move onto the row when you enter him.
        </p>
      </div>

      <dl className="mt-3 space-y-2.5">
        {waiting.map((row) => (
          <div
            key={row.driverId}
            className="grid gap-x-4 gap-y-1 sm:grid-cols-[13rem_1fr]"
          >
            <dt className="text-[14px] font-semibold text-ink">
              {row.fullName}
            </dt>
            {/* Verbatim, breaks and all. Two lines of a timecard run together
                into one is a different set of hours. */}
            <dd className="whitespace-pre-line font-mono text-[13px] leading-relaxed text-ink">
              {row.edit}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
