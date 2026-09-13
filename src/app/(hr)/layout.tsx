import Link from "next/link";
import { BuildTag } from "@/components/BuildTag";
import { RoleGate } from "@/components/RoleGate";
import { SignOutButton } from "@/components/SignOutButton";
import { StationDate } from "@/components/StationDate";
import { Wordmark } from "@/components/Wordmark";

export const metadata = { title: "HR — Closing SWFL" };

/**
 * HR chrome — desk first, and narrow.
 *
 * No navigation, because there is nowhere else to go. The whole portal is one
 * list of tonight's names and a box to paste into, and a row of links to
 * screens HR cannot open would only be four ways to be told no.
 *
 * Narrower than the dispatcher's 1600px too. That screen is a wide table
 * because the dispatcher is reading eleven columns at once; this one is a
 * column of names, and stretching it across a monitor would put the search box
 * and the name it found a foot apart.
 */
export default function HrLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/hr" className="rounded-sm">
            <Wordmark />
          </Link>

          <div className="flex items-center gap-3">
            <StationDate className="tnum hidden font-mono text-xs text-ink-muted sm:inline" />
            <SignOutButton />
            <span className="rounded-full border border-bud-line bg-bud-soft px-2.5 py-1 text-[11px] font-semibold text-bud">
              HR
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <RoleGate allow={["hr"]}>{children}</RoleGate>
        <BuildTag />
      </main>
    </div>
  );
}
