import Link from "next/link";
import { BuildTag } from "@/components/BuildTag";
import { PortalSwitch } from "@/components/PortalSwitch";
import { RoleGate } from "@/components/RoleGate";
import { SignOutButton } from "@/components/SignOutButton";
import { StationDate } from "@/components/StationDate";
import { Wordmark } from "@/components/Wordmark";

export const metadata = { title: "Repairs — Closing SWFL" };

/**
 * Repairs chrome — the one portal with no favourite device.
 *
 * The other three each know what they are held in: the closer's is a phone in
 * a dark yard, the dispatcher's is a laptop with eleven columns on it, HR's is
 * a desk. This one is read on a phone stood next to a van and on a laptop in
 * the office, by whoever picked it up, so it is sized for the narrower of the
 * two and allowed to grow: `max-w-3xl` with the safe-area padding the closer's
 * chrome uses, because half the people opening it are holding a phone.
 *
 * No navigation, for the same reason HR has none — the board is the portal.
 * Tonight, the roster and the archive of past sheets are all somewhere this
 * role cannot go, and a row of links to them would be four ways of being told
 * no. The three lists it does have are inside the board, where they belong,
 * because they are one list filtered three ways rather than three screens.
 *
 * The one exception is the way back to the close, and it is an exception that
 * proves the rule: it only appears for somebody who came from there. A repairs
 * session still sees no navigation at all, because there is still nowhere it
 * can go. See PortalSwitch.
 */
export default function RepairsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-8">
          <Link href="/repairs" className="rounded-sm">
            <Wordmark />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <StationDate className="tnum hidden font-mono text-xs text-ink-muted sm:inline" />
            <PortalSwitch to="closing" />
            <SignOutButton />
            <span className="rounded-full border border-caution-line bg-caution-soft px-2.5 py-1 text-[11px] font-semibold text-caution">
              Repairs
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-safe sm:px-8 sm:py-10">
        {/* The closer is on this list now. He works both sides of the same van
            — he writes the fault at the handover and it lands here at End Day
            — and until now seeing what was outstanding meant signing out and
            back in. A one-time stand-in comes with him, because a one-time
            code is the closer screen with a clock on it. */}
        <RoleGate allow={["repairs", "closer", "onetime"]}>{children}</RoleGate>
        <BuildTag />
      </main>
    </div>
  );
}
