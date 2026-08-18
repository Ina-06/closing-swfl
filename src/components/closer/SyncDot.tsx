"use client";

import { useSyncState } from "@/lib/sync";

/**
 * A dot in the header, and nothing at all when everything is fine.
 *
 * Silence is the useful default: a permanent green light is a light nobody
 * reads, and this only has to earn attention on the two nights a month the
 * signal drops. When it does speak it says which of the two things is true,
 * because they need different reactions — "offline" means carry on, the phone
 * is holding it; "saving" means do not close this yet.
 */
export function SyncDot() {
  const { online, queued } = useSyncState();

  if (online && !queued) return null;

  const offline = !online;

  return (
    <span
      role="status"
      title={
        offline
          ? "No signal. Everything you tap is being kept on the phone and will go up on its own."
          : "Saving to the server."
      }
      className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${
        offline
          ? "border-warn-line bg-warn-soft text-warn"
          : "border-brand-line bg-brand-soft text-brand"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${
          offline ? "bg-warn" : "animate-pulse bg-brand"
        }`}
      />
      {offline ? "Offline" : "Saving"}
    </span>
  );
}
