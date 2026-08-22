import { CHECKS } from "@/lib/constants";
import type { EntryChecks } from "@/lib/types";

/**
 * The six things that have to come back with the van.
 *
 * Three states, not two. "Not looked at yet" is real information at 11pm with
 * six vans still out, and it must not read the same as "checked, and it is
 * missing". So the control cycles unchecked → yes → no → unchecked, and the
 * glyph carries the state as well as the colour.
 */
export type Check = boolean | null;

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
  className = "",
}: {
  label: string;
  value: Check;
  onChange: (next: Check) => void;
  disabled?: boolean;
  /** For the odd tile out — see the grid in ArrivalSheet. */
  className?: string;
}) {
  const state = String(value);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(next(value))}
      aria-label={`${label} — ${WORD[state]}. Tap to change.`}
      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border transition-colors active:brightness-[0.97] disabled:opacity-55 ${TONE[state]} ${className}`}
    >
      <span aria-hidden="true" className="text-[24px] font-bold leading-none">
        {GLYPH[state]}
      </span>
      {/* Small and barely tracked, because two of these six carry a reminder
          as well as a name — "Charger + Sharpie" has to break onto a second
          line inside a tile a thumb-width across without touching the sides. */}
      <span className="px-1 text-center text-[10px] font-bold uppercase leading-tight tracking-[0.04em]">
        {label}
      </span>
    </button>
  );
}

/**
 * The same three states, across the width of the sheet.
 *
 * For a check that is not one of the tiles — one that decides what the rest of
 * the screen shows rather than recording something that came back with the van.
 * It gets its own row because it is a gate, and because the answer is the point:
 * "None" and "Not checked yet" are two different nights, and neither of them
 * fits under a glyph in a tile a thumb-width across.
 *
 * The words are the caller's, since the tiles' "back / missing" says nothing
 * about a van. The cycle, the glyphs and the colours are shared with them, so a
 * green tick means the same thing everywhere on the screen.
 */
export function CheckBar({
  label,
  words,
  value,
  onChange,
}: {
  /** For the screen reader. What is on screen is the state, not the name. */
  label: string;
  /** Keyed by state: what this control means when it is grey, green and red. */
  words: Record<string, string>;
  value: Check;
  onChange: (next: Check) => void;
}) {
  const state = String(value);

  return (
    <button
      type="button"
      onClick={() => onChange(next(value))}
      aria-label={`${label} — ${words[state]}. Tap to change.`}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors active:brightness-[0.97] ${TONE[state]}`}
    >
      <span aria-hidden="true" className="text-[24px] font-bold leading-none">
        {GLYPH[state]}
      </span>
      <span className="text-[14px] font-bold uppercase tracking-wider">
        {words[state]}
      </span>
    </button>
  );
}

/**
 * The same states, read-only and small enough for a table row.
 *
 * The dispatcher cannot write these — the rules see to that — so on their
 * screen this is a row of status lights, not controls someone switched off.
 * It takes the whole entry rather than six props so the order can only ever be
 * the order in CHECKS.
 */
export function CheckChips({ values }: { values: EntryChecks }) {
  return (
    <span className="flex gap-1">
      {CHECKS.map((check) => {
        const value = values[check.field];
        const state = String(value);

        return (
          <span
            key={check.field}
            title={`${check.label} — ${WORD[state]}`}
            className={`grid size-5 place-items-center rounded-md border text-[10px] font-bold ${TONE[state]}`}
          >
            {value === null ? check.letter : GLYPH[state]}
          </span>
        );
      })}
    </span>
  );
}
