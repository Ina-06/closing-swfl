"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { AddDriverSheet } from "@/components/closer/AddDriverSheet";
import { ArrivalSheet } from "@/components/closer/ArrivalSheet";
import { DoneCard, WaitingCard } from "@/components/closer/DriverCard";
import { ErrorNote } from "@/components/ui/Field";
import { useEntries } from "@/lib/db/entries";
import { etaMinutes, minutesLate, stationNowMinutes } from "@/lib/eta";
import type { Entry, Session } from "@/lib/types";

/**
 * Karim's screen for the night.
 *
 * Two lists: who is still out, and who is in. The first is ordered by who is
 * due next, because that is the order the vans actually arrive in and the order
 * he wants to be reading in. Everything is live — the dispatcher enters a
 * driver on the laptop and the card is here before the phone is back in a
 * pocket.
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

  const { waiting, done } = useMemo(() => {
    const compare = sort === "name" ? byName : byEta;

    return {
      // Nothing to sort an arrival by until he has one, so the waiting list
      // stays on ETA when that chip is picked.
      waiting: entries
        .filter((entry) => entry.status !== "arrived")
        .sort(compare),
      done: entries
        .filter((entry) => entry.status === "arrived")
        .sort(sort === "arrival" ? byArrival : compare),
    };
  }, [entries, sort]);

  const total = Math.max(session.totalExpected, entries.length);
  const open = openId ? (entries.find((e) => e.id === openId) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="sticky top-below-header z-10 -mx-4 border-b border-line bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <p className="tnum font-mono text-[26px] font-bold leading-none tracking-tight">
            {done.length}
            <span className="text-ink-faint">/{total}</span>
            <span className="ml-2 font-sans text-[13px] font-semibold tracking-normal text-ink-muted">
              arrived
            </span>
          </p>

          <div className="flex items-center gap-2.5">
            {waiting.length > 0 ? (
              <p className="text-[12px] font-semibold text-ink-muted">
                {waiting.length} still out
              </p>
            ) : null}
            {/* Lives in the sticky header rather than under the list: a van
                turns up unannounced when there are still twenty names between
                Karim and the bottom of the screen. */}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-9 items-center gap-1 rounded-full border border-brand-line bg-brand-soft px-3 text-[13px] font-bold text-brand active:brightness-[0.97]"
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

      {entries.length === 0 ? (
        <Empty
          title="Nobody on the sheet yet"
          blurb="Drivers appear here the moment dispatch enters one. Leave this open — it updates on its own."
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Still out · {waiting.length}
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
                  className={`min-h-8 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
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

          {waiting.length === 0 ? (
            <p className="rounded-xl border border-arrived-line bg-arrived-soft px-4 py-3.5 text-[14px] font-semibold text-arrived">
              Everyone on the sheet is in.
            </p>
          ) : (
            <ul className="space-y-2">
              {waiting.map((entry) => (
                <li key={entry.id}>
                  <WaitingCard
                    entry={entry}
                    late={minutesLate(entry.eta, now)}
                    onOpen={() => setOpenId(entry.id)}
                  />
                </li>
              ))}
            </ul>
          )}

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
      )}

      {adding ? (
        <AddDriverSheet
          nightKey={nightKey}
          session={session}
          entries={entries}
          uid={uid}
          onAdded={(entryId) => {
            setAdding(false);
            // He is already stamped, so this opens on the arrived sheet — the
            // van number and checks are the next thing, and the time is there
            // to correct if it needs it.
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
          late={open.status === "arrived" ? null : minutesLate(open.eta, now)}
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
