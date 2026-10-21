"use client";

import { useEffect } from "react";
import { FLEET_KINDS, FleetRow, splitFleet } from "@/components/repairs/Fleet";
import { setFleetUsed } from "@/lib/db/fleet";
import { useKeepOnScreen } from "@/lib/keepOnScreen";
import type { FleetItem } from "@/lib/types";

/**
 * Today's available vans and gas cards, hanging off the pill that counts
 * them.
 *
 * The list Issam types on the repairs board, brought to the yard for the one
 * moment it matters there: a van that will not start at nine, a card that gets
 * declined. Karim — or whoever holds the close tonight — ticks off what he
 * used, and Issam sees it on the board as it happens.
 *
 * Ticking only. What is on the list is the Repairs login's to say, so there is
 * no add box and no remove button here.
 *
 * The same shell as Breakdown — the notch, the tap-anywhere-to-close — because
 * it hangs from the same row of pills and should read as one of them.
 */
export function AvailableDropdown({
  items,
  uid,
  onError,
  onClose,
}: {
  items: FleetItem[];
  uid: string;
  onError: (message: string | null) => void;
  onClose: () => void;
}) {
  const panel = useKeepOnScreen<HTMLDivElement>();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /** Local at once, loud if the server refuses it. */
  function toggle(item: FleetItem) {
    onError(null);
    setFleetUsed(item.id, !item.used, uid).catch((err: unknown) =>
      onError(
        err instanceof Error
          ? `That tick did not save: ${err.message}`
          : "That tick did not save.",
      ),
    );
  }

  return (
    <>
      {/* Anywhere else on the screen closes it — see Breakdown. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-20 cursor-default"
      />

      {/* Hangs leftwards from the pill's right edge, since it is usually the
          last pill across — and on a phone narrow enough to wrap it onto a
          line of its own, useKeepOnScreen slides it back on. */}
      <div
        ref={panel}
        className="absolute right-0 top-full z-30 mt-2 w-[272px] max-w-[calc(100vw-2rem)] translate-x-(--nudge)"
      >
        <span
          aria-hidden="true"
          className="absolute right-[calc(2rem+var(--nudge,0px))] top-0 size-2.5 -translate-y-1/2 translate-x-1/2 rotate-45 border-l border-t border-line-strong bg-surface"
        />

        <div className="max-h-[56dvh] overflow-y-auto overscroll-contain rounded-xl border border-line-strong bg-surface p-3 shadow-lg shadow-ink/10">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">
            Available vans &amp; gas cards
          </p>

          {/* Vans first, gas cards under them — the same order as the board. */}
          <div className="space-y-4">
            {FLEET_KINDS.map((option) => {
              const { spare, used } = splitFleet(items, option.kind);
              return (
                <section
                  key={option.kind}
                  aria-label={`Available ${option.label.toLowerCase()}`}
                  className="space-y-2"
                >
                  <h3 className="flex items-baseline gap-1.5 text-[14px] font-bold text-ink">
                    {option.label}
                    <span className="tnum font-mono text-[13px] text-arrived">
                      {spare.length}
                    </span>
                    <span className="text-[12px] font-semibold text-ink-muted">
                      available
                    </span>
                  </h3>

                  {spare.length + used.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-faint">
                      None on today&apos;s list.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                      {/* Used ones underneath, struck through, still there to
                          un-tick if the wrong one was caught. */}
                      {[...spare, ...used].map((item) => (
                        <FleetRow
                          key={item.id}
                          item={item}
                          onToggle={() => toggle(item)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
