import { Placeholder } from "@/components/Placeholder";

export const metadata = { title: "Closer — Closing SWFL" };

export default function CloserPage() {
  return (
    <Placeholder
      eyebrow="Phase 0 · shell"
      title="Closer"
      blurb="This is Karim's screen. Open it on a real phone, not a narrow desktop window — tap targets and one-handed reach are the actual requirements here."
      roadmap={[
        { phase: 4, label: "Live driver cards sorted by ETA, overdue tinted" },
        { phase: 4, label: "Tap a card, tap Arrived, stamp the clock-out time" },
        { phase: 5, label: "Van number, van issues, and Cell / Key / Fuel toggles" },
        { phase: 5, label: "Add a driver who arrives unannounced" },
        { phase: 6, label: "All Returning banner with sound and vibration" },
        { phase: 7, label: "End Day, generate the PDF, share it to WhatsApp" },
        { phase: 9, label: "Offline queue with a sync indicator" },
      ]}
    />
  );
}
