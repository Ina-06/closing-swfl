import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { SignOutButton } from "@/components/SignOutButton";
import { StationDate } from "@/components/StationDate";
import { Mark } from "@/components/Wordmark";

/**
 * Closer chrome — phone first, and only phone. Sticky compact header so the
 * arrived counter never scrolls away, safe-area padding for the notch and the
 * home indicator, and a single-column body sized for one-handed use.
 */
export default function CloserLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center gap-2.5 rounded-sm">
            <Mark className="size-7" />
            <span className="leading-none">
              <span className="block text-[14px] font-bold tracking-tight">
                Closing
              </span>
              <StationDate className="tnum mt-1 block font-mono text-[10px] text-ink-faint" />
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            <SignOutButton />
            <span className="rounded-full border border-arrived-line bg-arrived-soft px-2.5 py-1 text-[11px] font-semibold text-arrived">
              Closer
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6 pb-safe">
        {/* One-time keys land here too — they are a closer with an expiry. */}
        <RoleGate allow={["closer", "onetime"]}>{children}</RoleGate>
      </main>
    </div>
  );
}
