import { STATION_CODE } from "@/lib/constants";

/**
 * The mark: three rows of the sheet, the last one filled — the grid completing
 * as drivers come in. Used in both role headers so the two halves of the app
 * read as one product.
 */
export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-md bg-brand text-ink-inverse`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-[70%]">
        <rect x="5" y="3" width="14" height="18" rx="2.5" fill="currentColor" />
        <path
          d="M8.8 12.2 11.2 14.6 15.4 9.9"
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark />
      <div className="leading-none">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold tracking-tight">Closing</span>
          <span className="font-mono text-[10px] font-medium tracking-widest text-ink-faint">
            {STATION_CODE}
          </span>
        </div>
        {subtitle ? (
          <div className="mt-1 text-[11px] font-medium text-ink-muted">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
