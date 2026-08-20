"use client";

import { FLAGS, FlagTag } from "@/components/ui/FlagToggle";
import { stationTimeLabel } from "@/lib/constants";
import { lateLabel } from "@/lib/eta";
import { countInfractions } from "@/lib/infractions";
import type { Entry, RosterEntry } from "@/lib/types";

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
            {/* Worth knowing before he walks over, not after he opens the
                sheet. The infraction itself is in there. */}
            {entry.infractions.trim() ? (
              <span className="rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
                Infraction
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

/**
 * A name off tonight's roster that nobody has entered yet.
 *
 * He is out delivering — that is what being on the roster with no ETA against
 * you means — so he belongs in that list rather than in a footnote of grey
 * chips at the bottom of the screen, which is where these used to sit. Karim
 * counts vans, and a driver he cannot see is a driver he cannot count.
 *
 * Dashed, because there is genuinely nothing behind it: no ETA, no returns, no
 * note, no row in the database. Tapping it makes one — the same thing picking
 * his name in Add a driver does, which is what Karim wants when the van he was
 * never told about is standing in front of him.
 */
export function RosterCard({
  row,
  onOpen,
}: {
  row: RosterEntry;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl border border-dashed border-line-strong bg-surface/60 px-3.5 py-3 text-left transition-colors active:brightness-[0.97]"
    >
      <span className="flex items-center gap-3.5">
        <span className="w-[68px] shrink-0">
          <span className="block font-mono text-[19px] font-bold leading-none tracking-tight text-ink-faint">
            —
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase leading-none tracking-wider text-ink-faint">
            No ETA
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold leading-tight text-ink-muted">
            {row.fullName}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {row.isBud ? <FlagTag flag="bud" /> : null}
            {row.isTrainer ? <FlagTag flag="trn" /> : null}
            {row.isRescuer ? <FlagTag flag="res" /> : null}
          </span>
        </span>

        <Chevron />
      </span>
    </button>
  );
}

/**
 * A van standing in the yard, part-way through the handover.
 *
 * Its own card because it is its own state: he is not out on the road and he
 * is not finished, and reading either of those off this row would send Karim
 * to the wrong place. The ETA is gone — he is here, so it has stopped meaning
 * anything — and the van number takes its place as the sign of how far in he
 * has got.
 */
export function YardCard({
  entry,
  onOpen,
}: {
  entry: Entry;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-arrived-line bg-arrived-soft px-3.5 py-3 text-left transition-colors active:brightness-[0.97]"
    >
      <span className="w-[68px] shrink-0">
        <span className="block text-[11px] font-bold uppercase tracking-wider leading-none text-arrived">
          In the yard
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-tight">
          {entry.fullName}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {flagsOn(entry).map((flag) => (
            <FlagTag key={flag} flag={flag} />
          ))}
          {entry.infractions.trim() ? (
            <span className="rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
              Infraction
            </span>
          ) : null}
        </span>
      </span>

      {entry.van ? (
        <span className="tnum shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink-muted">
          {entry.van}
        </span>
      ) : null}

      <Chevron />
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
  // Stamped when Karim clocked him out, or relayed to the dispatcher over the
  // phone. Different sources, so they read differently on the card.
  const stamped = entry.clockOut;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-sunken/70 px-3.5 py-3 text-left transition-colors active:brightness-[0.97]"
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

      {/* The van is what tells him this record is finished. Missing is worth
          seeing from the list, because at End Day it is too late to go and
          look, and the spanner is worth seeing for the same reason — it is the
          only thing on this row that somebody has to do something about
          tomorrow. */}
      {entry.van ? (
        <span className="tnum shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink-muted">
          {entry.van}
          {entry.vanIssues.trim() ? (
            <span aria-hidden="true"> 🛠️</span>
          ) : null}
        </span>
      ) : (
        <span className="shrink-0 rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
          No van
        </span>
      )}

      <Infractions raw={entry.infractions} />

      <Chevron />
    </button>
  );
}

/**
 * How many he picked up, when the dispatcher wrote a number.
 *
 * A count rather than the word, because the difference between one and three is
 * the difference between a mention and a conversation, and this row is the last
 * place Karim sees the driver's name before the sheet goes up. The triangle on
 * its own is for an infraction typed without a figure in front of it — real,
 * and not something to invent a number for.
 */
function Infractions({ raw }: { raw: string }) {
  if (!raw.trim()) return null;
  const count = countInfractions(raw);

  return (
    <span className="tnum shrink-0 rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">
      <span aria-hidden="true">⚠️</span>
      <span className="sr-only">
        {count === null ? "Infraction" : `${count} infractions`}
      </span>
      {count === null ? "" : ` ${count}`}
    </span>
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
