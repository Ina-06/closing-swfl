/**
 * The three roster tags, using the station's own words.
 *
 * BUD leaves early, TRN is training, RES is on rescues. Colour never carries
 * the state on its own — the accessible name says which flag it is and whether
 * it is on, and the off state is visibly hollow rather than merely grey.
 */
export type Flag = "bud" | "trn" | "res";

export const FLAGS: readonly Flag[] = ["bud", "trn", "res"];

export const FLAG_TITLE: Record<Flag, string> = {
  bud: "Leaves early",
  trn: "Training",
  res: "On rescues",
};

const ON: Record<Flag, string> = {
  bud: "border-bud-line bg-bud-soft text-bud",
  trn: "border-trn-line bg-trn-soft text-trn",
  res: "border-res-line bg-res-soft text-res",
};

export function FlagToggle({
  flag,
  on,
  onChange,
  label,
  size = "md",
}: {
  flag: Flag;
  on: boolean;
  onChange: (next: boolean) => void;
  /** Whose flag this is, for screen readers. */
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} — ${flag.toUpperCase()}, ${FLAG_TITLE[flag].toLowerCase()}`}
      title={FLAG_TITLE[flag]}
      onClick={() => onChange(!on)}
      className={`shrink-0 rounded-full border font-bold uppercase tracking-wider transition-colors ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
      } ${
        on
          ? ON[flag]
          : "border-line bg-surface text-ink-faint hover:border-line-strong hover:text-ink-muted"
      }`}
    >
      {flag.toUpperCase()}
    </button>
  );
}

/** Read-only version, for the roster summary and later the closer's cards. */
export function FlagTag({ flag }: { flag: Flag }) {
  return (
    <span
      title={FLAG_TITLE[flag]}
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ON[flag]}`}
    >
      {flag.toUpperCase()}
    </span>
  );
}
