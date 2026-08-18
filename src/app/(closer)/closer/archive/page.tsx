import Link from "next/link";
import { Archive } from "@/components/Archive";

export const metadata = { title: "Past nights — Closing SWFL" };

/**
 * The closer's archive.
 *
 * No returns file here: that one is the dispatcher's, and the route would turn
 * it down anyway. What Karim comes back for is last night's sheet, usually
 * because the group chat lost it.
 */
export default function CloserArchivePage() {
  return (
    <div className="space-y-4">
      <header>
        <Link
          href="/closer"
          className="inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-brand"
        >
          <span aria-hidden="true">←</span> Tonight
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight">
          Past nights
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Tap a night to get its sheet again.
        </p>
      </header>

      <Archive canBuildReturns={false} />
    </div>
  );
}
