"use client";

import { FLAGS, FlagTag } from "@/components/ui/FlagToggle";
import { stationTimeLabel } from "@/lib/constants";
import { lateLabel } from "@/lib/eta";
import type { Entry } from "@/lib/types";

/**
 * One driver, as a card on the closer's phone.
 *
 * The whole card is the tap target — around 72px tall, which is a thumb
 * reaching across a phone in a dark yard, not a mouse pointer. Nothing inside
 * is separately clickable, so there is no way to miss.
 */

export function flagsOn(entry: Entry) {
  return FLAGS.filter((flag) =>
    flag === "bud"
      ? entry.isBud
      : flag === "trn"
        ? entry.isTrainer
        : entry.isRescuer,
  );
}

export function WaitingCard({
  entry,
  late,
  onOpen,
}: {
  entry: Entry;
  /** Minutes past the ETA, or null if he is not late. */
  late: number | null;
  onOpen: () => void;
}) {
  const overdue = late !== null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`block w-full rounded-xl border px-3.5 py-3 text-left transition-colors active:brightness-[0.97] ${
        overdue
          ? "border-overdue-line bg-overdue-soft"
          : "border-line bg-surface"
      }`}
    >
      <span className="flex items-center gap-3.5">
        {/* The ETA is what he is scanning for, so it leads. */}
        <span className="w-[68px] shrink-0">
          <span
            className={`tnum block font-mono text-[19px] font-bold leading-none tracking-tight ${
              overdue ? "text-overdue" : "text-ink"
            }`}
          >
            {entry.eta || "—"}
          </span>
          {overdue ? (
            <span className="mt-1 block text-[11px] font-semibold leading-none text-overdue">
              {lateLabel(late)}
            </span>
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold leading-tight">
            {entry.fullName}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {flagsOn(entry).map((flag) => (
              <FlagTag key={flag} flag={flag} />
            ))}
            {entry.addedByCloser ? (
              <span className="rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
                Unannounced
              </span>
            ) : null}
          </span>
        </span>

        <Chevron />
      </span>

      {entry.notes ? <NoteStrip>{entry.notes}</NoteStrip> : null}
    </button>
  );
}

export function DoneCard({
  entry,
  onOpen,
}: {
  entry: Entry;
  onOpen: () => void;
}) {
  // Stamped by tapping Arrived, or relayed to the dispatcher over the phone.
  // Different sources, so they read differently on the card.
  const stamped = entry.clockOut;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-sunken/70 px-3.5 py-2.5 text-left transition-colors active:brightness-[0.97]"
    >
      <span className="w-[68px] shrink-0">
        <span className="tnum block font-mono text-[15px] font-bold leading-none text-arrived">
          {stamped ? stationTimeLabel(stamped.toDate()) : entry.clockOutManual || "—"}
        </span>
        {stamped ? null : (
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider leading-none text-ink-faint">
            Reported
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink-muted">
        {entry.fullName}
      </span>

      {entry.notes ? (
        <span className="shrink-0 rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
          Note
        </span>
      ) : null}

      <Chevron />
    </button>
  );
}

/** Anything the dispatcher needed Karim to know. This is why it exists. */
function NoteStrip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-2.5 flex gap-2 rounded-lg border border-warn-line bg-warn-soft px-2.5 py-2">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-warn">
        Note
      </span>
      <span className="text-[13px] leading-snug text-warn">{children}</span>
    </span>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-ink-faint"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
