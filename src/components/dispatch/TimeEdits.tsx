"use client";

import { useMemo } from "react";
import { timeEditTargets } from "@/lib/timeEdits";
import type { Entry, Session } from "@/lib/types";

/**
 * Everything HR has changed about tonight's hours, in one place.
 *
 * A panel rather than a column. The dispatcher's table is eleven columns wide
 * already, and a time edit is two or three pasted lines out of a payroll
 * system — put in a cell it would either be clipped to the first few words,
 * which is worse than not showing it, or it would set the height of every row
 * on the sheet.
 *
 * It is also not per-row information in the way everything else on that table
 * is. A driver can have an edit before he has phoned in, and a driver who went
 * back out has two rows and one set of hours. Reading it as a list of people
 * is reading it the way it was written.
 *
 * Nothing at all when there are none, which is most nights. A panel that says
 * "no time edits" every evening is a panel nobody looks at on the night there
 * is one; the marker in the table is what says which rows to look for.
 */
export function TimeEdits({
  session,
  entries,
}: {
  session: Session;
  entries: Entry[];
}) {
  const edited = useMemo(
    () =>
      timeEditTargets(session, entries).filter(
        (row) => row.edit.trim() !== "",
      ),
    [session, entries],
  );

  if (edited.length === 0) return null;

  return (
    <section className="rounded-xl border border-bud-line bg-bud-soft/40 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-bud">
          Time edits from HR · {edited.length}
        </h2>
        <p className="text-[12px] text-ink-muted">
          Karim has these on his phone too.
        </p>
      </div>

      <dl className="mt-3 space-y-2.5">
        {edited.map((row) => (
          <div
            key={row.driverId}
            className="grid gap-x-4 gap-y-1 sm:grid-cols-[13rem_1fr]"
          >
            <dt className="text-[14px] font-semibold text-ink">
              {row.fullName}
              {/* He is on the roster and nobody has entered him. Worth a word
                  here, because an edit against a name with no row is the one
                  case where the dispatcher cannot find him on the table
                  below. */}
              {row.entered ? null : (
                <span className="ml-2 align-middle text-[11px] font-medium text-ink-faint">
                  not entered yet
                </span>
              )}
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
