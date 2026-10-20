"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Nudges a panel hanging off a pill back inside the screen.
 *
 * The row of pills on the closer's screen wraps on a narrow phone, so which
 * edge of the screen a pill ends up near depends on the phone and on the
 * figures in the pills that night. A panel that hangs a fixed way from its
 * pill was right on one phone and half off the edge on the next. This
 * measures where the panel landed and shifts it sideways by however much it
 * is over, keeping a 16px gutter — the page's own.
 *
 * The shift is written to the panel as `--nudge`, for the panel to move by
 * and for its notch to move back by, so the notch still points at its pill.
 * Written straight onto the element rather than through state: it is a
 * measurement of layout, and a render to apply it would only be a frame of
 * the panel in the wrong place.
 */
const GUTTER = 16;

export function useKeepOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;

    const measure = () => {
      panel.style.setProperty("--nudge", "0px");
      const rect = panel.getBoundingClientRect();
      const room = window.innerWidth;
      let nudge = 0;
      if (rect.left < GUTTER) nudge = GUTTER - rect.left;
      else if (rect.right > room - GUTTER) nudge = room - GUTTER - rect.right;
      panel.style.setProperty("--nudge", `${nudge}px`);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return ref;
}
