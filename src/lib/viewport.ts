"use client";

import { useEffect, useState } from "react";

/**
 * What the phone can actually show, once the keyboard is up.
 *
 * A bottom sheet is `position: fixed`, and fixed means fixed to the *layout*
 * viewport — the page as it was before the keyboard appeared. The keyboard is
 * then drawn on top of it. So a sheet anchored to the bottom of the screen is
 * anchored to a strip of glass that is now underneath a keyboard, and anything
 * in the lower half of it is simply gone: Karim types three letters of a name,
 * the one match he wanted renders below the box, and the only way to see it is
 * to dismiss the keyboard he is still typing into.
 *
 * `visualViewport` is the part the browser will admit to. `height` is what is
 * left above the keyboard; `inset` is how much of the screen the keyboard has
 * taken, which is the distance a bottom-anchored sheet has to be lifted by.
 *
 * Both are zero and null where the API does not exist — every desktop browser
 * that matters has it, but a sheet that only works on a phone that answers
 * this question is worse than one that falls back to its stylesheet.
 */
export type Viewport = {
  /** Pixels of screen the keyboard has taken from the bottom. 0 when down. */
  inset: number;
  /** Usable height above the keyboard, or null if the browser will not say. */
  height: number | null;
};

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>({
    inset: 0,
    height: null,
  });

  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;

    const read = () => {
      /**
       * What is below the visible region, not what is missing from it.
       *
       * `offsetTop` is the part scrolled off the top, and on iOS it is not zero
       * while the keyboard is up — the browser scrolls the focused field into
       * view. Subtracting only the height would count that twice and lift the
       * sheet into the middle of the screen.
       */
      const inset = window.innerHeight - (view.height + view.offsetTop);
      setViewport({
        inset: Math.max(0, Math.round(inset)),
        height: Math.round(view.height),
      });
    };

    read();
    view.addEventListener("resize", read);
    // The keyboard coming up scrolls the visual viewport as well as resizing
    // it, and on iOS the two do not arrive together.
    view.addEventListener("scroll", read);

    return () => {
      view.removeEventListener("resize", read);
      view.removeEventListener("scroll", read);
    };
  }, []);

  return viewport;
}
