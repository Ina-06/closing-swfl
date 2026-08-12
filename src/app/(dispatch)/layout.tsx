import Link from "next/link";
import { StationDate } from "@/components/StationDate";
import { Wordmark } from "@/components/Wordmark";

/**
 * Dispatcher chrome — laptop first. Wide container, persistent top bar, room
 * for the entry form on the left and the live table beneath it (Phase 3).
 */
export default function DispatchLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="rounded-sm">
            <Wordmark />
          </Link>

          <div className="flex items-center gap-3">
            <StationDate className="tnum hidden font-mono text-xs text-ink-muted sm:inline" />
            <span className="rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">
              Dispatcher
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
