"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AddDriverSheet } from "@/components/closer/AddDriverSheet";
import { AllReturningBanner } from "@/components/closer/AllReturningBanner";
import { ArrivalSheet } from "@/components/closer/ArrivalSheet";
import { DoneCard, WaitingCard, YardCard } from "@/components/closer/DriverCard";
import { EndDay } from "@/components/closer/EndDay";
import { Summary } from "@/components/closer/Summary";
import { ErrorNote } from "@/components/ui/Field";
import { FlagTag } from "@/components/ui/FlagToggle";
import { useEntries } from "@/lib/db/entries";
import { etaMinutes, minutesLate, stationNowMinutes } from "@/lib/eta";
import type { Entry, Session } from "@/lib/types";

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
  const now = useStationClock();

  const { returning, delivering, inYard, done } = useMemo(() => {
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
      // what byEta falls back to anyway.
      delivering: out.filter((entry) => entry.eta.trim() === "").sort(compare),
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

  /** Anyone whose night is not finished — out on the road or stood at the van. */
  const outstanding = returning.length + delivering.length + inYard.length;

  /**
   * On the roster, but dispatch has not heard from him yet.
   *
   * Entries are created as drivers call in, so until then a name exists only on
   * the session roster. Without this the count and the list disagreed — "5/6
   * arrived, 0 still out" is arithmetic Karim cannot act on, because the sixth
   * man was nowhere on his screen.
   */
  const pending = useMemo(() => {
    const entered = new Set(entries.map((entry) => entry.driverId));
    return session.roster.filter((row) => !entered.has(row.driverId));
  }, [session.roster, entries]);

  // Counts everyone expected tonight, including anyone the closer added who was
  // never on the roster at all.
  const total = Math.max(session.totalExpected, entries.length + pending.length);
  const open = openId ? (entries.find((e) => e.id === openId) ?? null) : null;

  /**
   * A sheet is over the list, so the list is not his screen at the moment.
   *
   * Read from what is actually rendered rather than from `openId`, which can
   * still be pointing at an entry the dispatcher has since removed.
   */
  const busyWithADriver = adding || open !== null;

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

          <div className="flex items-center gap-2.5">
            {/* Whichever number is the reason the night is not over. Falling
                back down the list matters: with everyone on the sheet already
                in, "0 still out" beside "5/6" reads like a broken counter. */}
            {returning.length > 0 ? (
              <p className="text-[12px] font-semibold text-ink-muted">
                {returning.length} returning
              </p>
            ) : delivering.length > 0 ? (
              <p className="text-[12px] font-semibold text-ink-muted">
                {delivering.length} still delivering
              </p>
            ) : inYard.length > 0 ? (
              <p className="text-[12px] font-semibold text-arrived">
                {inYard.length} in the yard
              </p>
            ) : pending.length > 0 ? (
              <p className="text-[12px] font-semibold text-ink-muted">
                {pending.length} not called in
              </p>
            ) : null}
            {/* Lives in the sticky header rather than under the list: a van
                turns up unannounced when there are still twenty names between
                Karim and the bottom of the screen. */}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-11 items-center gap-1 rounded-full border border-brand-line bg-brand-soft px-3.5 text-[13px] font-bold text-brand active:brightness-[0.97]"
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

      {entries.length === 0 && pending.length === 0 ? (
        <Empty
          title="Nobody on the sheet yet"
          blurb="Drivers appear here the moment dispatch enters one. Leave this open — it updates on its own."
        />
      ) : null}

      {entries.length > 0 ? (
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
              {pending.length > 0
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
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Still delivering · {delivering.length}
              </h2>
              <ul className="space-y-2">
                {delivering.map((entry) => (
                  <li key={entry.id}>
                    <WaitingCard
                      entry={entry}
                      late={null}
                      onOpen={() => setOpenId(entry.id)}
                    />
                  </li>
                ))}
              </ul>
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
                    <YardCard entry={entry} onOpen={() => setOpenId(entry.id)} />
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
                    <DoneCard entry={entry} onOpen={() => setOpenId(entry.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {pending.length > 0 ? (
        <section className="space-y-2 pt-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Not called in · {pending.length}
          </h2>
          <p className="text-[12px] leading-relaxed text-ink-faint">
            On tonight&rsquo;s roster, but they haven&rsquo;t given dispatch an
            ETA yet. If one of them is in front of you, use{" "}
            <span className="font-semibold text-brand">+ Driver</span>.
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {pending.map((row) => (
              <li
                key={row.driverId}
                className="flex items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1.5 text-[13px] font-medium text-ink-muted"
              >
                {row.fullName}
                {row.isBud ? <FlagTag flag="bud" /> : null}
                {row.isTrainer ? <FlagTag flag="trn" /> : null}
                {row.isRescuer ? <FlagTag flag="res" /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The last thing on the screen that is information rather than a
          decision. End Day is underneath it on purpose: this is what he reads
          before he presses that. */}
      <Summary entries={entries} />

      <EndDay
        nightKey={nightKey}
        session={session}
        entries={entries}
        outstanding={outstanding}
        pending={pending.length}
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
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {open ? (
        <ArrivalSheet
          /* Keyed by driver: the van number and issues are local drafts, and a
             different driver has to start from his own, not the last one's. */
          key={open.id}
          nightKey={nightKey}
          entry={open}
          /* Lateness is measured against the clock, so it stops meaning
             anything the moment he is in — an hour later it would be counting
             up on a driver who parked early. */
          late={open.status === "enroute" ? minutesLate(open.eta, now) : null}
          uid={uid}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
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
