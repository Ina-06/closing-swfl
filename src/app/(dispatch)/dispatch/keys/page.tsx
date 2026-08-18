import { CloserKeys } from "@/components/dispatch/CloserKeys";

export const metadata = { title: "Closer codes — Closing SWFL" };

export default function KeysPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-[26px] font-bold tracking-tight">Closer codes</h1>
        <p className="mt-1 max-w-prose text-[14px] leading-relaxed text-ink-muted">
          For a stand-in covering the close. A code opens the closer screen
          once, expires twelve hours after you issue it, and can be cut off at
          any point before that. It never gives access to this screen.
        </p>
      </header>

      <CloserKeys />
    </div>
  );
}
