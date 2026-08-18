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
 * Two rising tones and a buzz.
 *
 * Synthesised rather than played from a file so there is no asset to load, no
 * request to fail, and nothing to go missing on a bad connection in the yard.
 * Every part of this is allowed to fail silently: the banner is the alert, and
 * the noise is what makes him look at it.
 */
function sound() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    void ctx.resume();

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

    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* Autoplay policy, or no audio hardware. The banner still shows. */
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
}: {
  nightKey: string;
  expected: number;
}) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed(nightKey),
    // Treated as dismissed on the server so it is never in the HTML — it
    // announces itself with a noise, and that has to happen on the client.
    () => true,
  );

  const alerted = useRef(false);

  useEffect(() => {
    if (dismissed || alerted.current) return;
    alerted.current = true;
    sound();
    buzz();
  }, [dismissed]);

  if (dismissed) return null;

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
