"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * All DAs returning.
 *
 * The one message that travels the other way down this app. It has to survive
 * a phone in a pocket, so it makes a noise, buzzes, and then stays on screen
 * until Karim says he has seen it — a notification he can miss is not a
 * notification.
 *
 * But it waits. Nothing about this appears while he has a driver open: see
 * `hold` below. That is the whole difference between a notification and an
 * interruption, and it is the reason this component takes a prop it would
 * otherwise have no business knowing about.
 *
 * Dismissal is per device and stored locally rather than on the session. Two
 * closers on two phones each need to dismiss their own, and the rules do not
 * let the closer write session fields for good reason.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function storageKey(nightKey: string) {
  return `closing:allReturning:${nightKey}`;
}

function readDismissed(nightKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(nightKey)) === "1";
  } catch {
    // Private browsing, or storage disabled. Showing the banner again after a
    // reload is a far smaller problem than crashing his only screen.
    return false;
  }
}

function dismiss(nightKey: string) {
  try {
    window.localStorage.setItem(storageKey(nightKey), "1");
  } catch {
    /* ignore — see above */
  }
  for (const listener of listeners) listener();
}

/**
 * Two rising tones and a buzz, and the tidy-up for them.
 *
 * Synthesised rather than played from a file so there is no asset to load, no
 * request to fail, and nothing to go missing on a bad connection in the yard.
 *
 * Every part of it is allowed to fail, and none of it is allowed to throw. An
 * audio context is a piece of hardware the browser lends you and can refuse or
 * take back at any moment — a locked phone, an autoplay policy, a call coming
 * in — so `resume` and `close` are promises that reject in the ordinary course
 * of events, not signs anything is wrong. The banner is the alert; the noise is
 * only what makes him look at it, and it must never be able to take the screen
 * down with it.
 */
function alarm(): () => void {
  buzz();

  const ctx = openContext();
  if (!ctx) return () => {};

  try {
    void ctx.resume().catch(() => {});

    for (const [index, frequency] of [880, 1245].entries()) {
      const at = ctx.currentTime + index * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = frequency;
      // Ramped rather than switched: an abrupt stop on a phone speaker clicks.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.18);
    }
  } catch {
    /* No audio hardware, or the context died mid-build. Fall through. */
  }

  // Handed back rather than left to a bare timer, so leaving the screen closes
  // the context instead of orphaning it. Browsers only lend out a handful.
  const timer = setTimeout(() => closeContext(ctx), 1200);
  return () => {
    clearTimeout(timer);
    closeContext(ctx);
  };
}

function openContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    return Ctx ? new Ctx() : null;
  } catch {
    return null;
  }
}

/** Closing a context that is already closing throws. It is not worth knowing. */
function closeContext(ctx: AudioContext) {
  try {
    if (ctx.state !== "closed") void ctx.close().catch(() => {});
  } catch {
    /* ignore */
  }
}

function buzz() {
  try {
    navigator.vibrate?.([220, 90, 220, 90, 450]);
  } catch {
    /* iOS has no vibrate at all. Nothing to do about that from a web page. */
  }
}

export function AllReturningBanner({
  nightKey,
  expected,
  hold,
}: {
  nightKey: string;
  expected: number;
  /**
   * He is in the middle of something — a driver open, a van number half typed.
   *
   * While this is true the banner does not exist: no sound, no buzz, and above
   * all no layout appearing behind an open sheet with the keyboard up. It was
   * never visible in that moment anyway; the sheet covers this row of the
   * screen. All it could do was startle him and move the ground under a text
   * box he was typing in.
   *
   * Nothing is lost by waiting. He gets the noise and the banner the moment he
   * is back on the list, which is the first moment he could have acted on it.
   */
  hold: boolean;
}) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed(nightKey),
    // Treated as dismissed on the server so it is never in the HTML — it
    // announces itself with a noise, and that has to happen on the client.
    () => true,
  );

  const quiet = hold || dismissed;
  const alerted = useRef(false);

  useEffect(() => {
    if (quiet || alerted.current) return;
    alerted.current = true;
    return alarm();
  }, [quiet]);

  if (quiet) return null;

  return (
    <div
      role="alert"
      className="-mx-4 mb-2 flex items-center gap-3 border-b border-brand-line bg-brand px-4 py-3 text-ink-inverse"
    >
      <span aria-hidden="true" className="text-[20px] leading-none">
        📢
      </span>

      <p className="min-w-0 flex-1 text-[15px] font-bold leading-tight">
        All DAs returning
        <span className="mt-0.5 block text-[13px] font-medium opacity-90">
          {expected} expected tonight
        </span>
      </p>

      <button
        type="button"
        onClick={() => dismiss(nightKey)}
        className="min-h-10 shrink-0 rounded-lg bg-ink-inverse/15 px-3 text-[13px] font-bold active:bg-ink-inverse/25"
      >
        Got it
      </button>
    </div>
  );
}
