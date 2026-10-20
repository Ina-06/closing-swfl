"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this is a laptop — a mouse or trackpad — rather than a phone.
 *
 * Asked of the pointer rather than the screen width, because the question is
 * really "could a tap here be an accident". A thumb scrolling a list on a
 * phone brushes text all the time; a mouse click on a line of text is meant.
 * So anything that turns a click into editing in place asks this first, and a
 * phone keeps the sheet that has to be opened on purpose.
 *
 * False on the server and on the first render, so the phone behaviour is what
 * renders until the browser has answered.
 */
const QUERY = "(hover: hover) and (pointer: fine)";

export function useFinePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
