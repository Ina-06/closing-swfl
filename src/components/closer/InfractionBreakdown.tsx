"use client";

import { useEffect } from "react";
import type { InfractionLine } from "@/lib/totals";

/**
 * Whose infractions they are, hanging off the figure that counts them.
 *
 * A menu rather than a section of the page, because it answers a question
 * Karim asks two or three times a night and never wants on screen the rest of
 * it. It comes out of the pill it belongs to — the little notch is what says
 * which figure this is a breakdown of — and the first tap anywhere else takes
 * it away again.
 *
 * Name in ink and the count in a bubble beside it, in the same amber as the
 * figure above. The name is what he reads; the number is what he reads it
 * against, and a driver on two is a different conversation from a driver on
 * one.
 *
 * Positioned against whatever it is rendered inside, so the caller owns where
 * it hangs from. Its own file because the board is long enough already and
 * because this is the one piece of it worth looking at on its own.
 */
export function InfractionBreakdown({
  lines,
  onClose,
}: {
  lines: InfractionLine[];
  onClose: () => void;
}) {
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
          className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-warn-line bg-warn-soft"
        />

        <div className="max-h-[46dvh] overflow-y-auto overscroll-contain rounded-xl border border-warn-line bg-warn-soft shadow-lg shadow-ink/10">
          <p className="sticky top-0 border-b border-warn-line bg-warn-soft px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-warn">
            Who
          </p>
          <ul className="divide-y divide-warn-line/70">
            {lines.map((line) => (
              <li
                key={line.driverId || line.fullName}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-tight text-ink">
                  {line.fullName}
                </span>
                <span className="tnum grid size-6 shrink-0 place-items-center rounded-full border border-warn-line bg-warn/15 font-mono text-[12px] font-bold text-warn">
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
