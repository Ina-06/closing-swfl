"use client";

import { useEffect } from "react";
import { FleetGroup, FleetRow, splitFleet } from "@/components/repairs/Fleet";
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
  const { spare, used } = splitFleet(items);
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

          <div className="space-y-3">
            <FleetGroup title="Available" count={spare.length}>
              {spare.length === 0 ? (
                <p className="px-3 py-3 text-[13px] text-ink-faint">
                  Everything on the list has been used today.
                </p>
              ) : (
                spare.map((item) => (
                  <FleetRow key={item.id} item={item} onToggle={() => toggle(item)} />
                ))
              )}
            </FleetGroup>

            {used.length > 0 ? (
              <FleetGroup title="Used today" count={used.length}>
                {used.map((item) => (
                  <FleetRow key={item.id} item={item} onToggle={() => toggle(item)} />
                ))}
              </FleetGroup>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
