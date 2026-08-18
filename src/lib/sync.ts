"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether what is on the screen has actually reached the server.
 *
 * With the cache on, a write succeeds instantly whether or not the phone has
 * signal — which is the point, and also the danger. Karim needs to be able to
 * tell "I stamped that van" from "I stamped that van and it is safe", and
 * nothing else on his screen would ever look different.
 *
 * The listener that knows the answer is the entries subscription, deep in the
 * board; the thing that has to show it is the header, two layouts up. So the
 * answer lives here, in a module, rather than being threaded between them.
 */

export type SyncState = {
  online: boolean;
  /** Writes accepted locally that the server has not acknowledged. */
  queued: boolean;
};

/**
 * Held as one object that is only replaced when something actually changes.
 * useSyncExternalStore compares snapshots by identity, so returning a fresh
 * object each read would re-render forever.
 */
let snapshot: SyncState = { online: true, queued: false };

const listeners = new Set<() => void>();

function publish(next: SyncState) {
  if (next.online === snapshot.online && next.queued === snapshot.queued) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Called by the entries listener on every metadata change. */
export function setQueued(queued: boolean) {
  publish({ ...snapshot, queued });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  const update = () => publish({ ...snapshot, online: navigator.onLine });
  update();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

/** The server snapshot is the quiet state — nothing to report before hydration. */
const AT_REST: SyncState = { online: true, queued: false };

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => AT_REST,
  );
}
