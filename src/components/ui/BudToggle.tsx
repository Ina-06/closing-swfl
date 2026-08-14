/**
 * BUD — a driver who works a few hours and leaves early.
 *
 * The station's own word, so it stays the label. Colour alone never carries
 * the state: the pill also gains a ring and the accessible name says on/off.
 */
export function BudToggle({
  on,
  onChange,
  label,
  size = "md",
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  /** Whose BUD flag this is, for screen readers. */
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} — BUD`}
      onClick={() => onChange(!on)}
      className={`shrink-0 rounded-full border font-bold uppercase tracking-wider transition-colors ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      } ${
        on
          ? "border-bud-line bg-bud-soft text-bud"
          : "border-line bg-surface text-ink-faint hover:border-line-strong hover:text-ink-muted"
      }`}
    >
      BUD
    </button>
  );
}
