import Link from "next/link";
import { BuildTag } from "@/components/BuildTag";
import { PortalSwitch } from "@/components/PortalSwitch";
import { RoleGate } from "@/components/RoleGate";
import { SignOutButton } from "@/components/SignOutButton";
import { StationDate } from "@/components/StationDate";
import { Mark } from "@/components/Wordmark";
import { AddJobButton, AddJobProvider } from "@/components/repairs/AddJob";

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
 *
 * Top left is the closer's own logo — the same mark, the same type, the date
 * underneath — with "Repairs" where it says "Closing", so the two sides of
 * the door read as one app. The board's heading and its orange role chip
 * both went: the logo names the screen, Add job takes the chip's place, and
 * the list starts directly under the header.
 */
export default function RepairsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AddJobProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/90 pt-safe backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4 sm:px-8">
            <Link href="/repairs" className="flex items-center gap-2.5 rounded-sm">
              <Mark className="size-7" />
              <span className="leading-none">
                <span className="block text-[14px] font-bold tracking-tight">
                  Repairs
                </span>
                <StationDate className="tnum mt-1 block max-w-[9ch] font-mono text-[10px] text-ink-faint" />
              </span>
            </Link>

            <div className="flex items-center gap-1 sm:gap-3">
              <PortalSwitch to="closing" />
              <SignOutButton />
              <AddJobButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-4 pb-safe sm:px-8 sm:py-8">
          {/* The closer is on this list now. He works both sides of the same van
              — he writes the fault at the handover and it lands here at End Day
              — and until now seeing what was outstanding meant signing out and
              back in.

              A one-time stand-in is deliberately not. Everywhere else in the app
              a borrowed code is a closer, because a stand-in covering the close
              does the close; this board is the station's rather than the
              night's, and a code that stops working in twelve hours has no
              business on a list that outlives every session on it. Turned away
              here rather than shown a board of controls that bounce — the rules
              draw the same line, with isPermanentCloser. */}
          <RoleGate allow={["repairs", "closer"]}>{children}</RoleGate>
          <BuildTag />
        </main>
      </div>
    </AddJobProvider>
  );
}
