import Link from "next/link";
import { NavLink } from "@/components/dispatch/NavLink";
import { RoleGate } from "@/components/RoleGate";
import { SignOutButton } from "@/components/SignOutButton";
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
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-6">
            <Link href="/dispatch" className="rounded-sm">
              <Wordmark />
            </Link>
            <nav className="flex items-center gap-1 text-[13px] font-semibold">
              <NavLink href="/dispatch">Tonight</NavLink>
              <NavLink href="/dispatch/drivers">Drivers</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <StationDate className="tnum hidden font-mono text-xs text-ink-muted sm:inline" />
            <SignOutButton />
            <span className="rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">
              Dispatcher
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8 sm:py-12">
        <RoleGate allow={["dispatcher"]}>{children}</RoleGate>
      </main>
    </div>
  );
}
