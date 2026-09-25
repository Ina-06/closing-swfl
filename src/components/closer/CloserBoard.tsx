"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AddDriverSheet } from "@/components/closer/AddDriverSheet";
import { AllReturningBanner } from "@/components/closer/AllReturningBanner";
import { ArrivalSheet } from "@/components/closer/ArrivalSheet";
import {
  DoneCard,
  RosterCard,
  WaitingCard,
  YardCard,
} from "@/components/closer/DriverCard";
import { Breakdown } from "@/components/closer/Breakdown";
import { EndDay } from "@/components/closer/EndDay";
import { RosterSheet } from "@/components/closer/RosterSheet";
import { Summary } from "@/components/closer/Summary";
import { BroadcastNote } from "@/components/BroadcastNote";
import { NoteSheet } from "@/components/NoteSheet";
import { ErrorNote } from "@/components/ui/Field";
import { addCloserEntry } from "@/lib/db/closer";
import { useEntries } from "@/lib/db/entries";
import { etaMinutes, minutesLate, stationNowMinutes } from "@/lib/eta";
import { pendingNote } from "@/lib/notes";
import { timeEditFor } from "@/lib/timeEdits";
import { infractionsByDriver, nightTotals, returnsByDriver } from "@/lib/totals";
import type { Entry, RosterEntry, Session } from "@/lib/types";

/**
 * Karim's screen for the night.
 *
 * Four lists, in the order a driver moves through them: returning, still
 * delivering, in the yard, clocked out. The split at the top is the one that
 * earns its place — a driver with an ETA is a van to watch the gate for, a
 * driver without one is still working, and they are nothing like each other
 * however alike they look on a roster.
 *
 * Then the summary, which is the same night read the other way round: not a
 * queue to work through but a grid to check before he signs it off.
 *
 * Everything is live — the dispatcher enters a driver on the laptop and the
 * card is here before the phone is back in a pocket.
 */

type SortKey = "eta" | "name" | "arrival";

/** A driver still out with no time against him, with or without a row. */
type Delivering =
  | { kind: "entry"; key: string; fullName: string; entry: Entry }
  | { kind: "roster"; key: string; fullName: string; roster: RosterEntry };

const SORTS: { key: SortKey; label: string }[] = [
  { key: "eta", label: "ETA" },
  { key: "name", label: "Name" },
  { key: "arrival", label: "Arrival" },
];

function byName(a: Entry, b: Entry) {
  return a.fullName.localeCompare(b.fullName);
}

/** Due soonest first. An ETA we could not read goes to the bottom, not the top. */
function byEta(a: Entry, b: Entry) {
  const left = etaMinutes(a.eta);
  const right = etaMinutes(b.eta);
  if (left === null && right === null) return byName(a, b);
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right || byName(a, b);
}

/** Most recent first — the last van in is the one he might have mis-stamped. */
function byArrival(a: Entry, b: Entry) {
  const left = a.clockOut?.toMillis() ?? null;
  const right = b.clockOut?.toMillis() ?? null;
  if (left === null && right === null) return byEta(a, b);
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 15_000);
  window.addEventListener("focus", onChange);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", onChange);
  };
}

/**
 * Where we are on tonight's timeline, or null until the client has hydrated.
 *
 * Null on the server on purpose: rendering "12m late" during SSR would mean
 * shipping a lateness calculated at build-adjacent time, and it would flicker
 * the moment the real clock arrived.
 */
function useStationClock(): number | null {
  const tick = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 30_000),
    () => null,
  );
  return tick === null ? null : stationNowMinutes();
}

export function CloserBoard({
  nightKey,
  session,
  uid,
}: {
  nightKey: string;
  session: Session;
  uid: string;
}) {
  const { entries, error } = useEntries(nightKey);
  const [sort, setSort] = useState<SortKey>("eta");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /**
   * The note sheet is open, and whether it is about one driver or everybody.
   *
   * One piece of state rather than two booleans, because the sheet is one sheet
   * and two flags could both be true — which is a state that has no rendering.
   */
  const [noting, setNoting] = useState<"driver" | "everyone" | null>(null);
  /** The dashed name whose sheet is open. Opening it writes nothing. */
  const [openRoster, setOpenRoster] = useState<RosterEntry | null>(null);
  const [arriving, setArriving] = useState(false);
  /**
   * The sheet about to open belongs to a driver who has just this second
   * arrived, so it should land on the van number the way pressing Arrived
   * inside the sheet does. Cleared when the sheet closes.
   */
  const [openOnVan, setOpenOnVan] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  /**
   * Folded to begin with.
   *
   * Early in a wave this is the longest list on the screen and every name on it
   * is a driver Karim can do nothing about — he has no time for them and no van
   * to watch the gate for. Open, it pushed the vans that *are* coming in, and
   * the yard, and the clocked-out list, off the bottom of the phone. The count
   * beside the heading is the part he actually reads, and that is still there
   * folded.
   */
  const [deliveringOpen, setDeliveringOpen] = useState(false);
  /**
   * Which of the two figures has been tapped and is showing who it belongs to.
   *
   * Closed by default and closed again on the way out of anything else: it is
   * an answer to a question, not a panel, and it sits over the top of the list
   * Karim works down.
   *
   * One value rather than a flag each, because the two pills sit side by side
   * and two panels open at once would overlap. Tapping one closes the other,
   * which is also how it reads: he is asking about returns *instead of* asking
   * about infractions.
   */
  const [breakdown, setBreakdown] = useState<"returns" | "infractions" | null>(
    null,
  );
  const now = useStationClock();

  const { returning, deliveringEntries, inYard, done } = useMemo(() => {
    const compare = sort === "name" ? byName : byEta;
    const out = entries.filter((entry) => entry.status === "enroute");

    return {
      /**
       * An ETA is dispatch saying he has turned round and is on his way in.
       * That is the whole difference between these two lists: one is drivers
       * Karim is waiting for, the other is drivers still working, and until now
       * they were one pile called "still out" that told him nothing about which
       * van to expect next.
       */
      returning: out.filter((entry) => entry.eta.trim() !== "").sort(compare),
      // No ETA, so there is nothing to sort them by but their names — which is
      // what byEta falls back to anyway. Merged with the roster names further
      // down, since to Karim those are the same thing.
      deliveringEntries: out.filter((entry) => entry.eta.trim() === "").sort(compare),
      inYard: entries
        .filter((entry) => entry.status === "arrived")
        .sort(compare),
      /**
       * Finished drivers go by when they finished, whichever way the chip is
       * set — except by name, which means by name everywhere.
       *
       * An ETA has stopped meaning anything to a man who is already home. It is
       * the time he clocked out that Karim is looking for down here, because
       * the one he wants is nearly always the one he has just done.
       */
      done: entries
        .filter((entry) => entry.status === "clockedOut")
        .sort(sort === "name" ? byName : byArrival),
    };
  }, [entries, sort]);

  /**
   * Anyone whose night is not finished — out on the road or stood at the van.
   *
   * Names off the roster that were never entered are deliberately not in this.
   * Karim cannot clock out a driver who has no row, so counting them here would
   * hide End Day behind something he has no way of clearing. They get a soft
   * warning on that panel instead, which is the dispatcher's problem to fix.
   */
  const outstanding =
    returning.length + deliveringEntries.length + inYard.length;

  /**
   * On the roster, but dispatch has not heard from him yet.
   *
   * Entries are created as drivers call in, so until then a name exists only on
   * the session roster. Without this the count and the list disagreed — "5/6
   * arrived, 0 still out" is arithmetic Karim cannot act on, because the sixth
   * man was nowhere on his screen.
   */
  const notEntered = useMemo(() => {
    const entered = new Set(entries.map((entry) => entry.driverId));
    return session.roster.filter((row) => !entered.has(row.driverId));
  }, [session.roster, entries]);

  /**
   * Everyone still out with no time against him, whether he has a row or not.
   *
   * The two halves look identical from where Karim is standing — a driver on
   * tonight's roster that dispatch has not entered is a driver out delivering,
   * exactly like one who has been entered but has not phoned a time in. So they
   * are one list, in one alphabet, rather than a list and a footnote.
   */
  const delivering = useMemo<Delivering[]>(() => {
    const rows: Delivering[] = [
      ...deliveringEntries.map(
        (entry) =>
          ({ kind: "entry", key: entry.id, fullName: entry.fullName, entry }) as const,
      ),
      ...notEntered.map(
        (roster) =>
          ({
            kind: "roster",
            key: `roster:${roster.driverId}`,
            fullName: roster.fullName,
            roster,
          }) as const,
      ),
    ];

    return rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [deliveringEntries, notEntered]);

  // Counts everyone expected tonight, including anyone the closer added who was
  // never on the roster at all.
  const total = Math.max(
    session.totalExpected,
    entries.length + notEntered.length,
  );
  const open = openId ? (entries.find((e) => e.id === openId) ?? null) : null;

  /** Tonight's two figures. Counted in one place — see lib/totals. */
  const totals = useMemo(() => nightTotals(entries), [entries]);
  /** The same two figures, broken down by who they belong to. */
  const infractionLines = useMemo(
    () => infractionsByDriver(entries),
    [entries],
  );
  const returnsLines = useMemo(() => returnsByDriver(entries), [entries]);

  /**
   * A sheet is over the list, so the list is not his screen at the moment.
   *
   * Read from what is actually rendered rather than from `openId`, which can
   * still be pointing at an entry the dispatcher has since removed.
   */
  const busyWithADriver =
    adding || noting !== null || openRoster !== null || open !== null;

  /**
   * A roster name becomes a real driver — but only once Karim has said so.
   *
   * This is the Arrived button on his dashed card's sheet, not the tap that
   * opened it. Tapping the card writes nothing: it is as often a thumb on the
   * wrong line as it is a van, and a tap that silently put a row on the sheet
   * had no way back to being a name on the roster.
   *
   * From here it is the ordinary write Add a driver does. He lands in the yard
   * with his sheet open on the van, which is where the next thing he types is.
   */
  async function addFromRoster(row: RosterEntry) {
    if (arriving) return;
    setArriving(true);
    setAddError(null);
    try {
      const entryId = await addCloserEntry(
        nightKey,
        entries,
        {
          driverId: row.driverId,
          fullName: row.fullName,
          roster: row,
          // Anything he wrote against this name while it was still dashed comes
          // with him onto the row, so it is on the sheet he is about to open.
          notes: pendingNote(session, row.driverId),
        },
        uid,
      );
      setOpenRoster(null);
      setOpenId(entryId);
      // He is in the yard and the sheet is opening on the van, so the caret
      // starts where the Arrived button leaves it for everybody else.
      setOpenOnVan(true);
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Could not add him to the sheet.",
      );
    } finally {
      setArriving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-below-header z-10 -mx-4 border-b border-line bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur-md">
        {/* Inside the sticky block, so "stays at the top" is literal — it does
            not scroll away while he works down the list. Held back entirely
            while a driver is open: this row of the screen is underneath the
            sheet then, so appearing there could only move the page behind a
            box he is typing in, for a banner he cannot see or dismiss. */}
        {session.status === "allReturning" ? (
          <AllReturningBanner
            nightKey={nightKey}
            expected={total}
            hold={busyWithADriver}
          />
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="tnum font-mono text-[26px] font-bold leading-none tracking-tight">
            {done.length}
            <span className="text-ink-faint">/{total}</span>
            <span className="ml-2 font-sans text-[13px] font-semibold tracking-normal text-ink-muted">
              clocked out
            </span>
          </p>

          {/* Both numbers, stacked, while anyone is still on the road. They
              answer different questions — how many vans to watch the gate
              for, and how many are not even heading back yet — and reading
              one without the other tells him half of where the night is.

              A zero stays on screen here, because during a wave "0 returning"
              is a fact worth having: nobody has phoned a time in. Once
              everyone is off the road both lines go, and the yard count takes
              their place rather than leaving a pair of noughts behind. */}
          {returning.length > 0 || delivering.length > 0 ? (
            <div className="text-right leading-tight">
              <p className="text-[12px] font-semibold text-ink">
                {returning.length} returning
              </p>
              <p className="text-[12px] font-semibold text-ink-muted">
                {delivering.length} still delivering
              </p>
            </div>
          ) : inYard.length > 0 ? (
            <p className="text-[12px] font-semibold text-arrived">
              {inYard.length} in the yard
            </p>
          ) : null}
        </div>

        {/* Wraps rather than squeezing. Three buttons and two figures do not
            fit across a 390px phone, and the two halves are different kinds of
            thing anyway — what the night has added up to, and what he can do
            about it — so a narrow screen puts them on a line each. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* The night's two figures. They are not about any one driver, which
              is why they are up here and not on a card: at End Day somebody
              always asks how many returns and how many infractions, and until
              now the only way to answer was to add up the sheet by eye.

              Both of them open. The figure and the answer to the question it
              provokes are one control: "seven returns" is what gets asked for
              at End Day, "whose" is what gets asked half a second later, and
              reading it off the sheet meant opening forty of them. */}
          <div className="flex items-start gap-2">
            <div className="relative">
              <Total
                label="Returns"
                value={totals.returns}
                open={breakdown === "returns"}
                onClick={
                  returnsLines.length > 0
                    ? () =>
                        setBreakdown((was) =>
                          was === "returns" ? null : "returns",
                        )
                    : undefined
                }
              />

              {breakdown === "returns" && returnsLines.length > 0 ? (
                /* Plain rather than amber. Returns are a quantity, not a
                   fault, and a second warning-coloured panel would take the
                   colour out of the one beside it that is a warning. */
                <Breakdown
                  lines={returnsLines}
                  tone="plain"
                  onClose={() => setBreakdown(null)}
                />
              ) : null}
            </div>

            <div className="relative">
              <Total
                label="Infractions"
                value={totals.infractions}
                warn
                open={breakdown === "infractions"}
                onClick={
                  infractionLines.length > 0
                    ? () =>
                        setBreakdown((was) =>
                          was === "infractions" ? null : "infractions",
                        )
                    : undefined
                }
              />

              {breakdown === "infractions" && infractionLines.length > 0 ? (
                <Breakdown
                  lines={infractionLines}
                  onClose={() => setBreakdown(null)}
                />
              ) : null}
            </div>
          </div>

          {/* All three live in the sticky header rather than under the list. A
              van turns up unannounced, something worth writing down about a
              driver occurs to him, the gate code turns out to have changed —
              all at moments when there are still twenty names between Karim and
              the bottom of the screen. */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setNoting("driver")}
              className="flex min-h-11 items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-bold text-ink active:brightness-[0.97]"
            >
              <span aria-hidden="true" className="text-[16px] leading-none">
                +
              </span>
              Note
            </button>
            {/* Blue, like the strip it writes, so the two are obviously the
                same thing seen from either end. */}
            <button
              type="button"
              onClick={() => setNoting("everyone")}
              aria-label="Add a note for everyone tonight"
              className="flex min-h-11 items-center gap-1 rounded-full border border-brand-line bg-surface px-3 text-[13px] font-bold text-brand active:brightness-[0.97]"
            >
              <span aria-hidden="true" className="text-[16px] leading-none">
                +
              </span>
              Note all
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-11 items-center gap-1 rounded-full border border-brand-line bg-brand-soft px-3 text-[13px] font-bold text-brand active:brightness-[0.97]"
            >
              <span aria-hidden="true" className="text-[16px] leading-none">
                +
              </span>
              Driver
            </button>
          </div>
        </div>

        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={done.length}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Drivers arrived"
        >
          <div
            className="h-full rounded-full bg-arrived transition-[width] duration-500"
            style={{ width: `${total ? (done.length / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {error ? <ErrorNote>Lost the live feed: {error}</ErrorNote> : null}
      {addError ? <ErrorNote>{addError}</ErrorNote> : null}

      {/* Above the lists because it is not about anybody on them. It is the
          first thing on the screen under the counts, and it is on every
          driver's sheet as well — this is where he reads it once, that is
          where it is in front of him while he is stood at a van. */}
      {session.broadcastNote ? (
        <BroadcastNote>{session.broadcastNote}</BroadcastNote>
      ) : null}

      {entries.length === 0 && notEntered.length === 0 ? (
        <Empty
          title="Nobody on the sheet yet"
          blurb="Drivers appear here the moment dispatch enters one. Leave this open — it updates on its own."
        />
      ) : null}

      {entries.length > 0 || notEntered.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Returning · {returning.length}
            </h2>
            <div
              role="group"
              aria-label="Sort drivers"
              className="flex rounded-lg border border-line bg-surface p-0.5"
            >
              {SORTS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={sort === option.key}
                  onClick={() => setSort(option.key)}
                  className={`min-h-11 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                    sort === option.key
                      ? "bg-brand text-ink-inverse"
                      : "text-ink-muted"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {returning.length > 0 ? (
            <ul className="space-y-2">
              {returning.map((entry) => (
                <li key={entry.id}>
                  <WaitingCard
                    entry={entry}
                    late={minutesLate(entry.eta, now)}
                    timeEdit={timeEditFor(session, entry.driverId)}
                    onOpen={() => setOpenId(entry.id)}
                  />
                </li>
              ))}
            </ul>
          ) : delivering.length > 0 ? (
            /* Not the green strip: there are drivers out there, they just have
               not phoned a time in yet. Saying everyone is in would be wrong. */
            <p className="text-[13px] leading-relaxed text-ink-faint">
              Nobody has given dispatch a time yet.
            </p>
          ) : (
            <p className="rounded-xl border border-arrived-line bg-arrived-soft px-4 py-3.5 text-[14px] font-semibold text-arrived">
              {notEntered.length > 0
                ? "Everyone dispatch has entered is in."
                : "Everyone on the sheet is in."}
            </p>
          )}

          {/* Underneath, because they are further away. A driver with no time
              against him is one Karim can do nothing about yet — he is still
              on the road, and the van he should be watching for is in the list
              above this one. */}
          {delivering.length > 0 ? (
            <section className="space-y-2 pt-2">
              {/* Foldable, because early on it is the longest list on the
                  screen and every name on it is a driver Karim can do nothing
                  about. Folded, the count is still there — he has not lost the
                  number, only the twenty rows between it and the vans that are
                  actually coming in. */}
              <button
                type="button"
                onClick={() => setDeliveringOpen(!deliveringOpen)}
                aria-expanded={deliveringOpen}
                aria-controls="still-delivering"
                className="flex min-h-11 w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
              >
                <Caret open={deliveringOpen} />
                Still delivering · {delivering.length}
                <span className="sr-only">
                  {deliveringOpen ? "(tap to hide)" : "(tap to show)"}
                </span>
              </button>

              {deliveringOpen ? (
                <div id="still-delivering" className="space-y-2">
                  <ul className="space-y-2">
                    {delivering.map((row) =>
                      row.kind === "entry" ? (
                        <li key={row.key}>
                          <WaitingCard
                            entry={row.entry}
                            late={null}
                            timeEdit={timeEditFor(session, row.entry.driverId)}
                            onOpen={() => setOpenId(row.entry.id)}
                          />
                        </li>
                      ) : (
                        <li key={row.key}>
                          <RosterCard
                            row={row.roster}
                            note={pendingNote(session, row.roster.driverId)}
                            timeEdit={timeEditFor(session, row.roster.driverId)}
                            onOpen={() => {
                              setAddError(null);
                              setOpenRoster(row.roster);
                            }}
                          />
                        </li>
                      ),
                    )}
                  </ul>
                  {notEntered.length > 0 ? (
                    <p className="text-[12px] leading-relaxed text-ink-faint">
                      The dashed ones are on tonight&rsquo;s roster but dispatch
                      hasn&rsquo;t entered them. Tap one when his van pulls in
                      and it puts him in the yard.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Between the two lists because that is where these drivers are:
              off the road, not yet finished with. */}
          {inYard.length > 0 ? (
            <section className="space-y-2 pt-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-arrived">
                In the yard · {inYard.length}
              </h2>
              <ul className="space-y-2">
                {inYard.map((entry) => (
                  <li key={entry.id}>
                    <YardCard
                      entry={entry}
                      timeEdit={timeEditFor(session, entry.driverId)}
                      onOpen={() => setOpenId(entry.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {done.length > 0 ? (
            <section className="space-y-2 pt-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Clocked out · {done.length}
              </h2>
              <ul className="space-y-1.5">
                {done.map((entry) => (
                  <li key={entry.id}>
                    <DoneCard
                      entry={entry}
                      timeEdit={timeEditFor(session, entry.driverId)}
                      onOpen={() => setOpenId(entry.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {/* The last thing on the screen that is information rather than a
          decision. End Day is underneath it on purpose: this is what he reads
          before he presses that. */}
      <Summary nightKey={nightKey} entries={entries} uid={uid} />

      <EndDay
        nightKey={nightKey}
        session={session}
        entries={entries}
        outstanding={outstanding}
        pending={notEntered.length}
        uid={uid}
      />

      <p className="pt-1 text-center">
        <Link
          href="/closer/archive"
          className="inline-flex min-h-11 items-center px-4 text-[13px] font-semibold text-ink-muted"
        >
          Past nights
        </Link>
      </p>

      {adding ? (
        <AddDriverSheet
          nightKey={nightKey}
          session={session}
          entries={entries}
          uid={uid}
          onAdded={(entryId) => {
            setAdding(false);
            // He is already in the yard, so this opens straight onto the van —
            // the number and the checks are the next thing, and the clock-out
            // is at the bottom where it is for everyone else.
            setOpenId(entryId);
            setOpenOnVan(true);
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {noting ? (
        <NoteSheet
          /* Keyed by which kind it is, so switching between them starts the box
             from the right text rather than from the last one's. */
          key={noting}
          nightKey={nightKey}
          session={session}
          entries={entries}
          uid={uid}
          broadcast={noting === "everyone"}
          onClose={() => setNoting(null)}
        />
      ) : null}

      {openRoster ? (
        <RosterSheet
          row={openRoster}
          note={pendingNote(session, openRoster.driverId)}
          timeEdit={timeEditFor(session, openRoster.driverId)}
          broadcast={session.broadcastNote}
          busy={arriving}
          error={addError}
          onArrived={() => void addFromRoster(openRoster)}
          onClose={() => setOpenRoster(null)}
        />
      ) : null}

      {open ? (
        <ArrivalSheet
          /* Keyed by driver: the van number and issues are local drafts, and a
             different driver has to start from his own, not the last one's. */
          key={open.id}
          nightKey={nightKey}
          entry={open}
          timeEdit={timeEditFor(session, open.driverId)}
          broadcast={session.broadcastNote}
          /* The clock itself, not a lateness worked out from it. The sheet
             needs to compare the ETA against a different moment in each state —
             now while he is on the road or stood at the van, the stamp once he
             is clocked out — and only the sheet knows which state it is in. */
          now={now}
          uid={uid}
          openOnVan={openOnVan}
          onClose={() => {
            setOpenId(null);
            setOpenOnVan(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * One of the night's running totals.
 *
 * Label and figure on one line, because that is how it gets read out — "seven
 * returns" — and because two of these have to sit side by side across the
 * middle of a phone. Amber only once an infraction actually exists: a warning
 * colour on a nought is a warning about nothing, and it stops meaning anything
 * by the third night.
 *
 * A span until it is given something to do, and a real button the moment it is.
 * A figure that opens something has to look like it does — the caret is the
 * only thing on this row saying there is more behind it — and a figure with
 * nothing behind it must not be pressable at all, or Karim taps a nought and
 * learns the control does nothing.
 */
function Total({
  label,
  value,
  warn = false,
  onClick,
  open = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
  /** Omitted when there is nothing to break down. */
  onClick?: () => void;
  open?: boolean;
}) {
  const loud = warn && value > 0;
  const tone = loud
    ? "border-warn-line bg-warn-soft text-warn"
    : "border-line bg-surface text-ink-muted";

  const inside = (
    <>
      {/* Stacked, not side by side. "Infractions" beside its figure made a pill
          114px wide, and two of those plus the two buttons ran off the right of
          a 390px phone. Over the top it costs the width of the word alone. */}
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em]">
        {label}
        {onClick ? <Caret open={open} /> : null}
      </span>
      <span
        className={`tnum mt-1 font-mono text-[17px] font-bold ${
          loud ? "text-warn" : "text-ink"
        }`}
      >
        {value}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <span
        className={`flex flex-col items-center rounded-lg border px-2.5 py-1 leading-none ${tone}`}
      >
        {inside}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${value} ${label.toLowerCase()} — ${open ? "hide" : "show"} who`}
      className={`flex flex-col items-center rounded-lg border px-2.5 py-1 leading-none transition-colors active:brightness-[0.97] ${tone} ${
        open ? (loud ? "ring-2 ring-warn/25" : "ring-2 ring-ink/10") : ""
      }`}
    >
      {inside}
    </button>
  );
}

/** Points down when the list is showing, right when it is folded away. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function Empty({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink-muted">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-faint">
        {blurb}
      </p>
    </div>
  );
}
