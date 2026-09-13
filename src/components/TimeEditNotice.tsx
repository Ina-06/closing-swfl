/**
 * HR's change to a driver's hours, at the top of his sheet.
 *
 * One component rather than the markup twice, unlike the amber note beside it,
 * for one reason: this text was pasted and has to keep its line breaks, and a
 * `whitespace-pre-line` that exists in two files is a `whitespace-pre-line`
 * that will exist in one of them by next month.
 *
 * Under the note, always, on every screen that shows both. The note is a job
 * Karim has to do at the van; this is background for a conversation he might
 * have there. Ordering them the other way round would put the thing he must
 * act on second.
 */
export function TimeEditNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-bud-line bg-bud-soft px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-bud">
        Time edit · from HR
      </p>
      {/* Mono, like every other time in this app — half of what is pasted in
          here is clock times and they have to line up. */}
      <p className="mt-1 whitespace-pre-line font-mono text-[12.5px] leading-relaxed text-bud">
        {children}
      </p>
    </div>
  );
}
