export type RoadmapItem = { phase: number; label: string };

/**
 * Temporary panel that stands in for a screen we have not built yet. It shows
 * which phase fills this route in, so the shell is legible while we work
 * through the build. Every one of these is deleted by the time we hit Phase 9.
 */
export function Placeholder({
  eyebrow,
  title,
  blurb,
  roadmap,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  roadmap: RoadmapItem[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-6 sm:px-8 sm:py-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand">
          {eyebrow}
        </p>
        <h1 className="mt-2.5 text-2xl font-bold tracking-tight sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-muted">
          {blurb}
        </p>
      </div>

      <div className="px-5 py-5 sm:px-8 sm:py-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Lands here
        </h2>
        <ul className="mt-3.5 space-y-0.5">
          {roadmap.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0"
            >
              <span className="tnum grid size-6 shrink-0 place-items-center rounded-sm bg-sunken font-mono text-[11px] font-semibold text-ink-muted">
                {item.phase}
              </span>
              <span className="text-[14px] leading-snug text-ink">
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
