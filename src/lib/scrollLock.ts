/**
 * Holds the page behind a sheet still, counted so sheets can stack.
 *
 * Each sheet used to save `body.style.overflow` and put it back on close. With
 * two open at once (the registration sheet, then the preview over it) the
 * saves and restores crossed, and "hidden" could be the value put back — the
 * page then never scrolled again. Here the first lock hides the overflow, the
 * last unlock clears it, and an unlock only ever counts once.
 */
let holders = 0;

export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  holders += 1;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) document.body.style.overflow = "";
  };
}
