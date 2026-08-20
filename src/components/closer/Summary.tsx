"use client";

import type { Entry } from "@/lib/types";

/**
 * What is wrong with tonight, on one grid at the bottom of the screen.
 *
 * Only the drivers with something against them — a van issue, or a note from
 * dispatch. A clean handover has nothing anybody needs to read back, and twenty
 * rows of dashes would bury the three that matter. This is the list Karim runs
 * an eye down before he ends the night, so the shorter it is the better it
 * works: everything on it is something somebody has to do something about.
 *
 * The order is the order they will be numbered on the PDF, and it is the same
 * live data as the cards, so it fills itself in as he works. Nothing to refresh
 * and nothing to press.
 */
export function Summary({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return null;

  const flagged = entries.filter(
    (entry) => entry.vanIssues.trim() !== "" || entry.notes.trim() !== "",
  );

  return (
    <section className="space-y-2 pt-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        Summary
      </h2>

      {flagged.length === 0 ? (
        /* Said out loud rather than left blank. An empty section reads as one
           that has not loaded, and "nothing wrong tonight" is the answer he
           came down here for. */
        <p className="rounded-xl border border-arrived-line bg-arrived-soft px-4 py-3.5 text-[14px] font-semibold text-arrived">
          No van issues and no notes tonight.
        </p>
      ) : (
        /* Four columns will not fit a phone honestly, so the table keeps its
           width and scrolls inside its own box. Squeezing van issues into
           forty pixels would be worse than sliding it into view. */
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
              {flagged.map((entry) => (
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
      )}
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
