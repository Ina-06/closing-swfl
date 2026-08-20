"use client";

import type { Entry } from "@/lib/types";

/**
 * The whole night on one grid, at the bottom of the screen.
 *
 * Everything above this is a queue — who is out, who is here, who is finished —
 * and a queue is built for working through, not for reading back. This is the
 * reading back: every driver on the sheet at once, in the order they will be
 * numbered on the PDF, so before Karim ends the night he can run an eye down
 * the vans and the issues and see what he is about to sign off.
 *
 * It is the same live data as the cards, so it fills itself in as he works.
 * There is nothing to refresh and nothing to press.
 */
export function Summary({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="space-y-2 pt-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        Summary
      </h2>

      {/* Four columns will not fit a phone honestly, so the table keeps its
          width and scrolls inside its own box. Squeezing van issues into
          forty pixels would be worse than sliding it into view. */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-sunken/60">
              <Head className="w-[24%]">Name</Head>
              <Head className="w-[13%]">Van #</Head>
              <Head className="w-[33%]">Van issues</Head>
              <Head className="w-[30%]">
                Notes{" "}
                <span className="font-normal normal-case tracking-normal opacity-70">
                  (disp)
                </span>
              </Head>
            </tr>
          </thead>

          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-line align-top last:border-0"
              >
                <td className="px-3 py-2.5 text-[13px] font-semibold leading-snug">
                  {entry.fullName}
                </td>
                <td className="tnum px-3 py-2.5 font-mono text-[13px] font-bold leading-snug text-ink-muted">
                  {entry.van || <Blank />}
                </td>
                {/* Grounded and No fuel arrive here as text, written by the
                    controls on his sheet — so the one column anyone reads in
                    the morning already says both. */}
                <td className="px-3 py-2.5 text-[13px] leading-snug text-ink">
                  {entry.vanIssues.trim() || <Blank />}
                </td>
                <td className="px-3 py-2.5 text-[13px] leading-snug text-ink-muted">
                  {entry.notes.trim() || <Blank />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Head({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint ${className}`}
    >
      {children}
    </th>
  );
}

/** Empty on purpose reads differently to empty by accident. */
function Blank() {
  return (
    <span aria-label="nothing" className="text-ink-faint">
      —
    </span>
  );
}
