import { Placeholder } from "@/components/Placeholder";

export const metadata = { title: "Dispatch — Closing SWFL" };

export default function DispatchPage() {
  return (
    <Placeholder
      eyebrow="Phase 1 · signed in"
      title="Dispatcher"
      blurb="Roster paste, per-driver entry, and the live table all live on this route. You are authenticated as the dispatcher — the next phase starts putting real data behind this screen."
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
