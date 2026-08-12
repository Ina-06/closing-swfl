import { Placeholder } from "@/components/Placeholder";

export const metadata = { title: "Dispatch — Closing SWFL" };

export default function DispatchPage() {
  return (
    <Placeholder
      eyebrow="Phase 0 · shell"
      title="Dispatcher"
      blurb="Roster paste, per-driver entry, and the live table all live on this route. Right now it is an empty shell — the deploy works, nothing is wired to a database yet."
      roadmap={[
        { phase: 2, label: "Paste the Cortex roster, match names, flag BUDs" },
        { phase: 3, label: "Per-driver entry: ETA, returns, performance, metric, infractions, rescues" },
        { phase: 3, label: "Live table with inline editing — ETAs change constantly" },
        { phase: 6, label: "All Returning button and the returns spreadsheet" },
        { phase: 7, label: "Archive of past sessions with PDF re-download" },
        { phase: 8, label: "Generate a one-time closer key" },
      ]}
    />
  );
}
