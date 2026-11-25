import { Archive } from "@/components/Archive";

export const metadata = { title: "Archive — Closing SWFL" };

export default function DispatchArchivePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-[26px] font-bold tracking-tight">Archive</h1>
        <p className="mt-1 max-w-prose text-[14px] leading-relaxed text-ink-muted">
          Every night the station has run. Pull the sheet or the returns file
          for any of them, however long ago. Nothing here can be deleted.
        </p>
      </header>

      <Archive canBuildReturns />
    </div>
  );
}
