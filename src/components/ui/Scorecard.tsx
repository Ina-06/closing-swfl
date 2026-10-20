"use client";

import { SCORECARDS, type Scorecard } from "@/lib/constants";

/**
 * A scorecard tier in its own metal.
 *
 * Colour first, word second. Karim reads it across a van bonnet in the dark,
 * and a bronze bubble beside a platinum one is a different conversation
 * before he has read either label. The face is a soft diagonal sheen from
 * the light shade to the edge shade, which is what makes it read as metal
 * rather than as one more coloured pill.
 *
 * Classes are written out per tier rather than built from the name, because
 * Tailwind only generates what it can find spelled in full.
 */
const METAL: Record<Scorecard, string> = {
  bronze:
    "border-bronze-edge bg-linear-135 from-bronze-face to-bronze-edge/60 text-bronze",
  silver:
    "border-silver-edge bg-linear-135 from-silver-face to-silver-edge/60 text-silver",
  gold: "border-gold-edge bg-linear-135 from-gold-face to-gold-edge/60 text-gold",
  platinum:
    "border-platinum-edge bg-linear-135 from-platinum-face to-platinum-edge/60 text-platinum",
};

export function scorecardLabel(value: Scorecard): string {
  return SCORECARDS.find((tier) => tier.value === value)?.label ?? value;
}

export function ScorecardBubble({
  value,
  size = "md",
}: {
  value: Scorecard;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[13px]"
      } ${METAL[value]}`}
    >
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-current opacity-70"
      />
      {scorecardLabel(value)}
    </span>
  );
}

/**
 * Four tiers as one segmented control, for the driver database.
 *
 * Tapping the selected tier clears it, the same as the performance arrows:
 * most of the time the answer is "not set yet", and a fifth "None" button
 * would be the widest one in the row.
 */
export function ScorecardPicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: Scorecard | null;
  onChange: (next: Scorecard | null) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 rounded-lg border border-line bg-surface p-0.5"
    >
      {SCORECARDS.map((tier) => {
        const on = value === tier.value;
        return (
          <button
            key={tier.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            title={on ? `${tier.label} — click again to clear` : tier.label}
            onClick={() => onChange(on ? null : tier.value)}
            className={`min-h-8 rounded-md border px-2 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
              on
                ? METAL[tier.value]
                : "border-transparent text-ink-faint hover:text-ink-muted"
            }`}
          >
            {tier.label}
          </button>
        );
      })}
    </div>
  );
}
