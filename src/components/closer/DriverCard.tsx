"use client";

import { FLAGS, FlagTag } from "@/components/ui/FlagToggle";
import { stationTimeLabel } from "@/lib/constants";
import { lateLabel } from "@/lib/eta";
import { countInfractions } from "@/lib/infractions";
import { returnsOn } from "@/lib/totals";
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

/** Whether this driver has anything on him worth a second look. */
function hasSignals(entry: Entry) {
  return (
    entry.secondTrip ||
    entry.addedByCloser ||
    flagsOn(entry).length > 0 ||
    returnsOn(entry) > 0 ||
    entry.performance !== null ||
    entry.rescues !== 0 ||
    entry.infractions.trim() !== ""
  );
}

/**
 * Everything about a driver that can be read without opening his sheet.
 *
 * One component for every card, in one order, and that is the whole point of
 * it. It used to be three near-copies of the same handful of pills and they had
 * already drifted apart: the clocked-out row carried no flags at all, no
 * returns, and no Unannounced badge, so a driver stopped being a trainee and
 * stopped having eleven returns against him the moment Karim finished with him.
 * He is the same man on all four lists, and after End Day this row is the only
 * place the night is still readable without tapping forty sheets.
 *
 * The order is the order the conversation goes: who he is tonight — second
 * trip, roster flags, whether anybody knew he was coming — then what he brought
 * back with him, which is the returns, the trend, the rescues and anything he
 * picked up. Nothing renders when it has nothing to say, so the ordinary
 * driver's row stays one line and the whole list still fits a phone.
 */
function Signals({
  entry,
  className = "",
}: {
  entry: Entry;
  /** Where the row sits on this particular card. */
  className?: string;
}) {
  if (!hasSignals(entry)) return null;

  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* First, and not a flag: two rows carrying one name is the one thing on
          these lists that could be read as a mistake, and this is what says it
          is not. */}
      {entry.secondTrip ? <SecondTrip /> : null}
      {flagsOn(entry).map((flag) => (
        <FlagTag key={flag} flag={flag} />
      ))}
      {entry.addedByCloser ? <Unannounced /> : null}
      <ReturnsCount count={returnsOn(entry)} />
      <Trend direction={entry.performance} />
      <RescueCount count={entry.rescues} />
      <InfractionTag raw={entry.infractions} />
    </span>
  );
}

export function WaitingCard({
  entry,
  late,
  timeEdit,
  onOpen,
}: {
  entry: Entry;
  /** Minutes past the ETA, or null if he is not late. */
  late: number | null;
  /** What HR changed about his hours tonight, or "". */
  timeEdit: string;
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
          {/* Everything that changes how the conversation opens, before he
              walks over rather than after. Karim gets one look at this row
              while the van is still rolling in; finding out from the sheet
              that he is meeting a man who lost eleven packages is finding out
              too late. */}
          <Signals entry={entry} className="mt-1.5" />
        </span>

        <Chevron />
      </span>

      {entry.notes ? <NoteStrip>{entry.notes}</NoteStrip> : null}
      {timeEdit ? <TimeEditStrip>{timeEdit}</TimeEditStrip> : null}
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
 * Dashed, because there is almost nothing behind it: no ETA, no returns, no row
 * in the database. Tapping it makes one — the same thing picking his name in
 * Add a driver does, which is what Karim wants when the van he was never told
 * about is standing in front of him.
 *
 * The one thing there can be is a note he left himself, and it does not undash
 * the card. A note is Karim writing something down; it is not dispatch having
 * heard from the driver, and letting it read as though it were would take the
 * name off the list the dispatcher is working through.
 */
export function RosterCard({
  row,
  note,
  timeEdit,
  onOpen,
}: {
  row: RosterEntry;
  /** Written before he had a row. Stored on the session — see lib/notes. */
  note: string;
  /**
   * HR's edit to his hours. Reaches a dashed card for free, because it was
   * never kept on the row in the first place — see lib/timeEdits.
   */
  timeEdit: string;
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

      {note ? <NoteStrip>{note}</NoteStrip> : null}
      {timeEdit ? <TimeEditStrip>{timeEdit}</TimeEditStrip> : null}
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
  timeEdit,
  onOpen,
}: {
  entry: Entry;
  timeEdit: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl border border-arrived-line bg-arrived-soft px-3.5 py-3 text-left transition-colors active:brightness-[0.97]"
    >
      <span className="flex items-center gap-3">
        <span className="w-[68px] shrink-0">
          <span className="block text-[11px] font-bold uppercase tracking-wider leading-none text-arrived">
            In the yard
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold leading-tight">
            {entry.fullName}
          </span>
          <Signals entry={entry} className="mt-1" />
        </span>

        {entry.van ? (
          <span className="tnum shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink-muted">
            {entry.van}
          </span>
        ) : null}

        <Chevron />
      </span>

      {/* Here as well as on the waiting card, because the note is at its most
          useful in the ninety seconds this card describes: he is stood at the
          van with the driver in front of him. It used to disappear the moment
          the van pulled in, which is exactly when it was needed. */}
      {entry.notes ? <NoteStrip>{entry.notes}</NoteStrip> : null}
      {/* The ninety seconds this card describes is the whole reason a time edit
          is on his phone at all: the driver is stood at the van, and if his
          hours have been changed this is the moment he is going to ask about
          it. */}
      {timeEdit ? <TimeEditStrip>{timeEdit}</TimeEditStrip> : null}
    </button>
  );
}

export function DoneCard({
  entry,
  timeEdit,
  onOpen,
}: {
  entry: Entry;
  timeEdit: string;
  onOpen: () => void;
}) {
  // Stamped when Karim clocked him out, or relayed to the dispatcher over the
  // phone. Different sources, so they read differently on the card.
  const stamped = entry.clockOut;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl border border-line bg-sunken/70 px-3.5 py-3 text-left transition-colors active:brightness-[0.97]"
    >
      <span className="flex items-center gap-3">
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

        <Chevron />
      </span>

      {/* The same signals the returning card carries, in the same order and
          from the same component, because a driver does not stop being a
          trainee, or the man who lost eleven packages, the moment he is clocked
          out. Karim reads this list back at the end of the night and after End
          Day, and having to open every sheet to find out who the conversation
          is with is the reason they are here.

          Under the name rather than beside it. Alongside, half a dozen more
          things fighting the van chip for the right-hand side of a 390px phone
          left "Marcus Webb" reading "Marcus …", and a list of drivers whose
          names are cut off is not a list of drivers.

          The metric that sits beside the arrow inside the sheet still does not
          come out: it needs its own scale of five colours to mean anything, and
          this row has room for a signal, not a legend. */}
      <Signals entry={entry} className="mt-1.5 pl-[80px]" />

      {/* Deliberately still here after he has gone home. A time edit is a
          record rather than a reminder, and this list is what Karim reads back
          before End Day — an edit that vanished the moment the man was clocked
          out would disappear at exactly the point somebody checks the night
          against the hours. */}
      {timeEdit ? <TimeEditStrip>{timeEdit}</TimeEditStrip> : null}
    </button>
  );
}

/** He went back out and came in again. This row is the second one. */
function SecondTrip() {
  return (
    <span className="shrink-0 rounded-full border border-brand-line bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
      2nd
    </span>
  );
}

/**
 * A van in the yard belonging to somebody who is not on tonight's list.
 *
 * Worth a badge because somebody has to work out why, and it stays on the row
 * after he has gone home for the same reason: the working-out happens in the
 * morning, off the clocked-out list, long after the van has left.
 */
function Unannounced() {
  return (
    <span className="shrink-0 rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
      Unannounced
    </span>
  );
}

/**
 * Packages that came back with him.
 *
 * `3R`, in the station's own shorthand — that is how the dispatcher types it
 * into the field and how it gets said out loud, so it needs no legend. Counted
 * by the same function as the night's total (see lib/totals) rather than by
 * reading the raw text again here, because a card saying 3 while the header
 * says 7 across three drivers is a disagreement nobody can settle in a yard.
 *
 * Grey rather than a warning colour. Returns are a quantity, not a fault —
 * most of them are addresses nobody was in at — and an amber pill on half the
 * list would drain the colour out of the infraction next to it.
 *
 * Nothing at all at zero, which is most rows.
 */
function ReturnsCount({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="tnum shrink-0 rounded-md border border-line-strong bg-sunken px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink-muted">
      {count}
      <span aria-hidden="true">R</span>
      <span className="sr-only"> returns</span>
    </span>
  );
}

/**
 * Which way this driver's week is going, as the arrow and nothing else.
 *
 * The metric that sits beside it inside the sheet does not come out here. It
 * needs its own scale of five colours to mean anything, and a row Karim reads
 * in the half-second a van takes to park has room for one signal, not two.
 */
function Trend({ direction }: { direction: Entry["performance"] }) {
  if (!direction) return null;

  return (
    <span
      role="img"
      aria-label={direction === "up" ? "Trending up" : "Trending down"}
      className="shrink-0 text-[15px] leading-none"
    >
      {direction === "up" ? "📈" : "📉"}
    </span>
  );
}

/**
 * Rescues, as a number in a colour.
 *
 * Green is packages this driver took off somebody else, red is packages that
 * had to be taken off him — and on a card this size the colour is doing the
 * work a `+` or a `-` does inside the sheet. A minus sign on a phone held at
 * arm's length in a dark yard is one pixel wide; a red bubble is not.
 *
 * Nothing at all when the figure is zero, which is most of them. A row of
 * grey noughts down the list would cost the two that are not.
 */
function RescueCount({ count }: { count: number }) {
  if (count === 0) return null;

  const took = count > 0;

  return (
    <span
      className={`tnum shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold ${
        took
          ? "border-arrived-line bg-arrived-soft text-arrived"
          : "border-overdue-line bg-overdue-soft text-overdue"
      }`}
    >
      <span className="sr-only">
        {took ? "Rescued " : "Taken off him: "}
      </span>
      {Math.abs(count)}
      <span className="sr-only"> packages</span>
    </span>
  );
}

/**
 * How many he picked up, when the dispatcher wrote a number.
 *
 * A count rather than the word, because the difference between one and three is
 * the difference between a mention and a conversation, and these rows are the
 * last place Karim sees the driver's name before the sheet goes up. "Infraction"
 * on its own told him there was at least one and nothing else, which on a driver
 * who has had three is the wrong half of the fact.
 *
 * Read by the same parser as returns — see lib/infractions — so a station that
 * types "2 speeding 1 distraction" gets a 3 without anyone teaching this file
 * how the dispatcher writes.
 *
 * The bare word is for an infraction typed without a figure in front of it.
 * "Spoke to him about his scan rate" is real and has no number in it, and
 * inventing a 1 would be putting a count on the card that nobody wrote.
 *
 * One tag for all three cards. It was three copies of the same pill, and they
 * had already drifted — the clocked-out one carried a triangle the others did
 * not.
 */
function InfractionTag({ raw }: { raw: string }) {
  if (!raw.trim()) return null;
  const count = countInfractions(raw);

  return (
    <span
      className="tnum shrink-0 rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn"
      aria-label={
        count === null ? "Infraction" : `${count} infractions`
      }
    >
      <span aria-hidden="true">
        {count === null ? "Infra" : `${count} Infra`}
      </span>
    </span>
  );
}

/**
 * Anything anybody needed Karim to know when this driver turns up.
 *
 * Written from the laptop or from his own phone — it is one note either way,
 * and it reads the same however it got there. That is the point of it being one
 * field: he does not have to know who wrote it to act on it.
 */
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

/**
 * What HR changed about this driver's hours tonight.
 *
 * Under the note rather than folded into it, and in a different colour,
 * because they are different kinds of fact and only one of them is Karim's to
 * act on. The amber strip is a job — take his badge, ask him about Tuesday.
 * This one is not: it is the answer to a question the driver is about to ask
 * him, and the worst outcome is Karim saying he does not know.
 *
 * Purple, the same family as the BUD flag, which is the app's existing word
 * for a fact about somebody's hours. Amber is attention and green is done, and
 * a time edit is neither.
 *
 * whitespace-pre-line because it was pasted. Two lines out of a payroll system
 * run together into one is a different set of hours. Mono for the same reason
 * every other time in this app is: half of what is in here is clock times, and
 * they have to line up.
 */
function TimeEditStrip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-2 flex gap-2 rounded-lg border border-bud-line bg-bud-soft px-2.5 py-2">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-bud">
        Time
      </span>
      <span className="whitespace-pre-line font-mono text-[12px] leading-snug text-bud">
        {children}
      </span>
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
