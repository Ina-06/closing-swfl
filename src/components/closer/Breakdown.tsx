"use client";

import { useEffect } from "react";
import type { BreakdownLine } from "@/lib/totals";

/**
 * Whose they are, hanging off the figure that counts them.
 *
 * A menu rather than a section of the page, because it answers a question
 * Karim asks two or three times a night and never wants on screen the rest of
 * it. It comes out of the pill it belongs to — the little notch is what says
 * which figure this is a breakdown of — and the first tap anywhere else takes
 * it away again.
 *
 * Name in ink and the count in a bubble beside it. The name is what he reads;
 * the number is what he reads it against, and a driver on two is a different
 * conversation from a driver on one.
 *
 * One component for both figures. It was written for infractions and the
 * returns list is the same panel asking the same question, so it takes the
 * tone rather than being copied: amber for infractions, because the figure
 * above it is amber and a breakdown in a different colour from the number it
 * belongs to reads as a different thing. Plain for returns, because returns
 * are a quantity and not a fault — most of them are addresses nobody was in at
 * — and a second amber panel would drain the colour out of the one that is a
 * warning.
 *
 * Positioned against whatever it is rendered inside, so the caller owns where
 * it hangs from. Its own file because the board is long enough already and
 * because this is the one piece of it worth looking at on its own.
 */

export type BreakdownTone = "warn" | "plain";

/** Both halves of each tone in one place, so a panel cannot half-change. */
const TONE: Record<
  BreakdownTone,
  { panel: string; notch: string; head: string; rule: string; bubble: string }
> = {
  warn: {
    panel: "border-warn-line bg-warn-soft",
    notch: "border-warn-line bg-warn-soft",
    head: "border-warn-line bg-warn-soft text-warn",
    rule: "divide-warn-line/70",
    bubble: "border-warn-line bg-warn/15 text-warn",
  },
  plain: {
    panel: "border-line-strong bg-surface",
    notch: "border-line-strong bg-surface",
    head: "border-line bg-surface text-ink-faint",
    rule: "divide-line",
    bubble: "border-line-strong bg-sunken text-ink-muted",
  },
};

export function Breakdown({
  lines,
  tone = "warn",
  onClose,
}: {
  lines: BreakdownLine[];
  tone?: BreakdownTone;
  onClose: () => void;
}) {
  const skin = TONE[tone];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Anywhere else on the screen closes it. Behind the menu but over
          everything else, so the tap that dismisses it is not also the tap
          that opens somebody's sheet. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-20 cursor-default"
      />

      <div className="absolute left-1/2 top-full z-30 mt-2 w-[236px] max-w-[calc(100vw-2rem)] -translate-x-1/2">
        {/* The notch. A rotated square rather than a border trick, so it
            carries the panel's own border on the two sides that show. */}
        <span
          aria-hidden="true"
          className={`absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t ${skin.notch}`}
        />

        <div
          className={`max-h-[46dvh] overflow-y-auto overscroll-contain rounded-xl border shadow-lg shadow-ink/10 ${skin.panel}`}
        >
          <p
            className={`sticky top-0 border-b px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.08em] ${skin.head}`}
          >
            Who
          </p>
          <ul className={`divide-y ${skin.rule}`}>
            {lines.map((line) => (
              <li
                key={line.driverId || line.fullName}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-tight text-ink">
                  {line.fullName}
                </span>
                <span
                  className={`tnum grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[12px] font-bold ${skin.bubble}`}
                >
                  {line.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
