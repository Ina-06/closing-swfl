"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this machine has a mouse or trackpad.
 *
 * Two answers, either of which is enough. `any-pointer: fine` asks whether a
 * fine pointer exists anywhere — not `pointer`, which asks about the primary
 * one, and which a touchscreen laptop answers with "a finger" while somebody
 * is using its trackpad. And because even that is a browser's guess, the
 * first real mouse movement over the page settles it for good.
 *
 * Only for what to *show* — the × beside a job, the hint under the list.
 * Whether a click edits in place is decided by the click itself, from its
 * pointerType; see TaskRow on the repairs board.
 *
 * False on the server and on the first render, so the phone layout is what
 * renders until the browser has answered.
 */
const QUERY = "(any-pointer: fine)";

let mouseSeen = false;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || mouseSeen) return;
    mouseSeen = true;
    onChange();
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("pointermove", onMove);
  };
}

export function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mouseSeen || window.matchMedia(QUERY).matches,
    () => false,
  );
}
