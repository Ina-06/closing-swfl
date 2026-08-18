/**
 * Cell, Key, Fuel — the three things that have to come back with the van.
 *
 * Three states, not two. "Not looked at yet" is real information at 11pm with
 * six vans still out, and it must not read the same as "checked, and it is
 * missing". So the control cycles unchecked → yes → no → unchecked, and the
 * glyph carries the state as well as the colour.
 */
export type Check = boolean | null;

export const CHECK_LABELS = ["Cell", "Key", "Fuel"] as const;

function next(value: Check): Check {
  if (value === null) return true;
  if (value === true) return false;
  return null;
}

const GLYPH: Record<string, string> = {
  null: "–",
  true: "✓",
  false: "✕",
};

const WORD: Record<string, string> = {
  null: "not checked yet",
  true: "back",
  false: "missing",
};

const TONE: Record<string, string> = {
  null: "border-line bg-surface text-ink-faint",
  true: "border-arrived-line bg-arrived-soft text-arrived",
  false: "border-overdue-line bg-overdue-soft text-overdue",
};

export function CheckCycle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: Check;
  onChange: (next: Check) => void;
  disabled?: boolean;
}) {
  const state = String(value);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(next(value))}
      aria-label={`${label} — ${WORD[state]}. Tap to change.`}
      className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl border transition-colors active:brightness-[0.97] disabled:opacity-55 ${TONE[state]}`}
    >
      <span aria-hidden="true" className="text-[24px] font-bold leading-none">
        {GLYPH[state]}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wider">
        {label}
      </span>
    </button>
  );
}

/**
 * The same three states, read-only and small enough for a table row.
 *
 * The dispatcher cannot write these — the rules see to that — so on their
 * screen this is a status light, not a control.
 */
export function CheckChips({
  cell,
  vanKey,
  fuel,
}: {
  cell: Check;
  /** `key` is spoken for in React, so the van's key is spelled out. */
  vanKey: Check;
  fuel: Check;
}) {
  const checks: [string, Check][] = [
    ["C", cell],
    ["K", vanKey],
    ["F", fuel],
  ];

  return (
    <span className="flex gap-1">
      {checks.map(([letter, value]) => (
        <span
          key={letter}
          title={`${
            letter === "C" ? "Cell" : letter === "K" ? "Key" : "Fuel"
          } — ${WORD[String(value)]}`}
          className={`grid size-5 place-items-center rounded-md border text-[10px] font-bold ${
            TONE[String(value)]
          }`}
        >
          {value === null ? letter : GLYPH[String(value)]}
        </span>
      ))}
    </span>
  );
}
