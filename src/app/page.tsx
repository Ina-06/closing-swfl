import Link from "next/link";
import { StationDate } from "@/components/StationDate";
import { Wordmark } from "@/components/Wordmark";

/**
 * Phase 0 stand-in for the login screen. Phase 1 replaces this with the single
 * key field and three role buttons; the two role destinations stay the same.
 */
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface pt-safe">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <StationDate className="tnum hidden font-mono text-xs text-ink-muted sm:inline" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-5 py-12 sm:px-8 sm:py-16">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand">
          Phase 0 · shell deployed
        </p>
        <h1 className="mt-3 max-w-xl text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[44px]">
          The closing sheet,
          <br />
          off the clipboard.
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">
          Dispatch posts the wave, the closer stamps arrivals, and the night ends
          in a PDF instead of a photograph of a piece of paper.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <RoleCard
            href="/dispatch"
            accent="brand"
            device="Laptop"
            title="Dispatcher"
            blurb="Roster, ETAs, returns, and the All Returning call."
            icon={
              <>
                <rect x="3" y="5" width="18" height="12" rx="1.5" />
                <path d="M2 20h20" />
              </>
            }
          />
          <RoleCard
            href="/closer"
            accent="arrived"
            device="Phone"
            title="Closer"
            blurb="Arrivals, van checks, and End Day at the station."
            icon={
              <>
                <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
                <path d="M10.5 18.5h3" />
              </>
            }
          />
        </div>

        <p className="mt-10 max-w-md text-[13px] leading-relaxed text-ink-faint">
          Both routes are open right now. Phase 1 puts the shared access key in
          front of them and sends you to the right one automatically.
        </p>
      </main>
    </div>
  );
}

function RoleCard({
  href,
  title,
  blurb,
  device,
  accent,
  icon,
}: {
  href: string;
  title: string;
  blurb: string;
  device: string;
  accent: "brand" | "arrived";
  icon: React.ReactNode;
}) {
  const tone =
    accent === "brand"
      ? "text-brand before:bg-brand hover:border-brand-line"
      : "text-arrived before:bg-arrived hover:border-arrived-line";

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-xl border border-line bg-surface p-5 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6"
          aria-hidden="true"
        >
          {icon}
        </svg>
        <span className="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          {device}
        </span>
      </div>

      <h2 className="mt-8 text-lg font-bold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{blurb}</p>

      <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold">
        Open
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
        </svg>
      </span>
    </Link>
  );
}
