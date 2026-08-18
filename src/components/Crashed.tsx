"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * What a crash looks like.
 *
 * Mid-wave, the wrong thing to do is show a stack trace and the second wrong
 * thing is show nothing. This says what happened in one line, offers the one
 * button that fixes most of it, and — the part that actually matters —
 * promises that nothing typed has been lost, which is true: every write goes
 * to the device cache before it goes anywhere else, and a render crashing
 * cannot take it back out.
 */
export function Crashed({
  error,
  reset,
  where,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  where: string;
}) {
  const router = useRouter();

  useEffect(() => {
    // The digest is what ties this to a server log; the message is only
    // detailed in development, by design.
    console.error(`[closing] ${where} crashed:`, error);
  }, [error, where]);

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <h1 className="text-[20px] font-bold tracking-tight">
        That screen stopped working
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-muted">
        Nothing you entered has been lost — it is saved on this device and will
        go up on its own. Try loading the screen again.
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="min-h-12 rounded-lg bg-brand px-5 text-[15px] font-semibold text-ink-inverse transition-colors hover:bg-brand-hover"
        >
          Try again
        </button>
        {/* This boundary is itself a working tree — only a crash in the root
            layout escapes it, and global-error.tsx handles that one — so the
            router is live here and there is no need to reload the document. */}
        <button
          type="button"
          onClick={() => router.push("/")}
          className="min-h-12 rounded-lg border border-line-strong px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-sunken"
        >
          Start over
        </button>
      </div>

      {error.digest ? (
        <p className="mt-5 font-mono text-[11px] text-ink-faint">
          {error.digest}
        </p>
      ) : null}
    </div>
  );
}
