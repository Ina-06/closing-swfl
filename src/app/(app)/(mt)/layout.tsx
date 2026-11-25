import Link from "next/link";
import { BuildTag } from "@/components/BuildTag";
import { RoleGate } from "@/components/RoleGate";
import { SignOutButton } from "@/components/SignOutButton";
import { StationDate } from "@/components/StationDate";
import { Mark } from "@/components/Wordmark";

export const metadata = { title: "MT — Closing SWFL" };

/**
 * The MT portal: the inventory and nothing else.
 *
 * Opened with its own code, not the station key, by the team that counts the
 * parts shelf. Same chrome as the repairs board — the logo with "MT" where it
 * says "Repairs" — because it is the same list seen from the counting side.
 * No navigation: there is nowhere else this role can go.
 */
export default function MtLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4 sm:px-8">
          <Link href="/mt" className="flex items-center gap-2.5 rounded-sm">
            <Mark className="size-7" />
            <span className="leading-none">
              <span className="block text-[14px] font-bold tracking-tight">
                MT Inventory
              </span>
              <StationDate className="tnum mt-1 block max-w-[9ch] font-mono text-[10px] text-ink-faint" />
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <SignOutButton />
            <span className="rounded-full border border-caution-line bg-caution-soft px-2.5 py-1 text-[11px] font-semibold text-caution">
              MT
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 pb-safe sm:px-8 sm:py-8">
        <RoleGate allow={["mt"]}>{children}</RoleGate>
        <BuildTag />
      </main>
    </div>
  );
}
