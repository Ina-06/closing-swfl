"use client";

import { useMemo, useState } from "react";
import {
  addFleetItem,
  removeFleetItem,
  setFleetUsed,
  usedThisRound,
} from "@/lib/db/fleet";
import type { FleetItem, FleetKind } from "@/lib/types";

/**
 * Vans and gas cards — what went out today, and what is still spare.
 *
 * Issam ticks each one off after launch. The point of the list is the other
 * half of it: the ones nobody ticked are what is left in the yard and in the
 * drawer if a van breaks down at ten or a card gets declined. So the spare
 * ones are on top and counted in green, and the used ones sink underneath,
 * struck through, still there to un-tick if he caught the wrong one.
 *
 * Every tick belongs to the current session. When Karim ends the day the
 * whole list is spare again on its own — or when the dispatcher starts the
 * next one, if End Day never happened — so there is no "reset" button to
 * forget to press. See useFleetRound.
 */

export const FLEET_KINDS: {
  kind: FleetKind;
  label: string;
  noun: string;
  placeholder: string;
}[] = [
  { kind: "van", label: "Vans", noun: "van", placeholder: "Van number, e.g. 214" },
  {
    kind: "gasCard",
    label: "Gas cards",
    noun: "card",
    placeholder: "Card, e.g. 4 · 0912",
  },
];

/** Natural order, so van 7 comes before van 214 — the same as the job list. */
function byLabel(a: FleetItem, b: FleetItem): number {
  return a.label.localeCompare(b.label, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** Spare and used, for one kind, worked out once for the tabs and the list. */
export function splitFleet(items: FleetItem[], kind: FleetKind, round: string) {
  const spare: FleetItem[] = [];
  const used: FleetItem[] = [];
  for (const item of items) {
    if (item.kind !== kind) continue;
    (usedThisRound(item, round) ? used : spare).push(item);
  }
  return { spare: spare.sort(byLabel), used: used.sort(byLabel) };
}

/**
 * The tab pair, for the side panel on a laptop.
 *
 * Its own state — which of the two is showing — because on a laptop it sits
 * beside the job list rather than in place of it.
 */
export function FleetPanel({
  items,
  loading,
  round,
  canManage,
  uid,
  onError,
}: {
  items: FleetItem[];
  loading: boolean;
  /** The current round of ticks — see useFleetRound. */
  round: string;
  /**
   * May add and remove, not just tick. The Repairs login only — Karim
   * crossing over from the close ticks vans off and that is all.
   */
  canManage: boolean;
  uid: string;
  onError: (message: string | null) => void;
}) {
  const [kind, setKind] = useState<FleetKind>("van");

  return (
    <section
      aria-label="Vans and gas cards"
      className="rounded-xl border border-line bg-surface"
    >
      <div
        role="tablist"
        aria-label="Vans or gas cards"
        className="flex gap-1 border-b border-line p-1.5"
      >
        {FLEET_KINDS.map((option) => {
          const active = kind === option.kind;
          const spare = splitFleet(items, option.kind, round).spare.length;
          return (
            <button
              key={option.kind}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setKind(option.kind)}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                active
                  ? "bg-caution-soft text-caution"
                  : "text-ink-muted hover:bg-sunken"
              }`}
            >
              {option.label}
              <span
                className={`tnum font-mono text-[12px] font-bold ${
                  active ? "text-caution" : "text-ink-faint"
                }`}
              >
                {loading ? "" : spare}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-3">
        <FleetList
          key={kind}
          kind={kind}
          items={items}
          loading={loading}
          round={round}
          canManage={canManage}
          uid={uid}
          onError={onError}
        />
      </div>
    </section>
  );
}

/** One kind's list: spare on top, used today underneath, a box to add one. */
export function FleetList({
  kind,
  items,
  loading,
  round,
  canManage,
  uid,
  onError,
}: {
  kind: FleetKind;
  items: FleetItem[];
  loading: boolean;
  /** The current round of ticks — see useFleetRound. */
  round: string;
  /**
   * May add and remove, not just tick. The Repairs login only — Karim
   * crossing over from the close ticks vans off and that is all.
   */
  canManage: boolean;
  uid: string;
  onError: (message: string | null) => void;
}) {
  const meta = FLEET_KINDS.find((option) => option.kind === kind)!;
  const { spare, used } = useMemo(
    () => splitFleet(items, kind, round),
    [items, kind, round],
  );
  /** Remove buttons showing. Off by default so a tick never lands on one. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const total = spare.length + used.length;

  const duplicate = items.some(
    (item) =>
      item.kind === kind &&
      item.label.toLowerCase() === draft.trim().replace(/\s+/g, " ").toLowerCase(),
  );

  /** Same shape as the board's run(): local at once, loud if refused. */
  function run(what: string, write: Promise<unknown>) {
    onError(null);
    write.catch((err: unknown) =>
      onError(err instanceof Error ? `${what}: ${err.message}` : `${what} did not save.`),
    );
  }

  function add() {
    const label = draft.trim();
    if (!label || duplicate) return;
    setDraft("");
    run(`Adding that ${meta.noun}`, addFleetItem(kind, label, uid));
  }

  if (loading) {
    return (
      <div
        className="h-40 animate-pulse rounded-lg bg-sunken/60"
        aria-busy="true"
        aria-label={`Loading ${meta.label.toLowerCase()}`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        {/* The number this list exists for. */}
        <p className="leading-none">
          <span className="tnum font-mono text-[26px] font-bold tracking-tight text-arrived">
            {spare.length}
          </span>
          <span className="ml-1.5 text-[13px] font-semibold text-ink-muted">
            spare of {total}
          </span>
        </p>
        {canManage && total > 0 ? (
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing((was) => !was)}
            className="min-h-9 rounded-lg px-2.5 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-sunken active:bg-sunken"
          >
            {editing ? "Done" : "Edit list"}
          </button>
        ) : null}
      </div>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[13px] leading-relaxed text-ink-faint">
          {canManage
            ? `No ${meta.label.toLowerCase()} on the list yet. Add each one below once, and tick them off after launch every day.`
            : `No ${meta.label.toLowerCase()} on the list yet. They are added from the Repairs login.`}
        </p>
      ) : (
        <>
          <Group title="Spare" count={spare.length}>
            {spare.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-ink-faint">
                Every {meta.noun} has gone out today.
              </p>
            ) : (
              spare.map((item) => (
                <FleetRow
                  key={item.id}
                  item={item}
                  used={false}
                  editing={canManage && editing}
                  onToggle={() =>
                    run("Ticking that off", setFleetUsed(item.id, true, round, uid))
                  }
                  onRemove={() =>
                    run(`Removing that ${meta.noun}`, removeFleetItem(item.id))
                  }
                />
              ))
            )}
          </Group>

          {used.length > 0 ? (
            <Group title="Used today" count={used.length}>
              {used.map((item) => (
                <FleetRow
                  key={item.id}
                  item={item}
                  used
                  editing={canManage && editing}
                  onToggle={() =>
                    run("Putting that back", setFleetUsed(item.id, false, round, uid))
                  }
                  onRemove={() =>
                    run(`Removing that ${meta.noun}`, removeFleetItem(item.id))
                  }
                />
              ))}
            </Group>
          ) : null}
        </>
      )}

      {canManage ? (
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label htmlFor={`fleet-add-${kind}`} className="sr-only">
          Add a {meta.noun}
        </label>
        {/* 16px on the field itself, or iOS zooms the page on focus. */}
        <input
          id={`fleet-add-${kind}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={meta.placeholder}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution sm:text-[14px]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || duplicate}
          className="min-h-11 shrink-0 rounded-lg border border-caution-line bg-caution-soft px-3.5 text-[13px] font-bold text-caution transition-[filter] active:brightness-[0.97] disabled:opacity-45"
        >
          Add
        </button>
      </form>
      ) : null}
      {canManage && duplicate ? (
        <p className="-mt-1.5 text-[12px] text-ink-faint">
          Already on the list.
        </p>
      ) : null}
    </div>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {title}
        <span className="tnum font-mono">{count}</span>
      </h3>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {children}
      </ul>
    </div>
  );
}

/**
 * One van or card. The box is the whole row, because ticking is the only
 * thing anybody does here after launch — the remove button only appears in
 * Edit list, so a thumb working down twenty vans cannot land on it.
 */
function FleetRow({
  item,
  used,
  editing,
  onToggle,
  onRemove,
}: {
  item: FleetItem;
  used: boolean;
  editing: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex items-stretch bg-surface">
      <button
        type="button"
        role="checkbox"
        aria-checked={used}
        aria-label={`${used ? "Put back as spare" : "Used today"}: ${item.label}`}
        onClick={onToggle}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 text-left transition-colors hover:bg-sunken/60 active:bg-sunken"
      >
        <span
          className={`grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
            used
              ? "border-arrived bg-arrived text-ink-inverse"
              : "border-line-strong bg-surface"
          }`}
        >
          {used ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
              aria-hidden="true"
            >
              <path d="M5 12.5l5 5 9-10.5" />
            </svg>
          ) : null}
        </span>
        <span
          className={`tnum min-w-0 truncate font-mono text-[15px] font-bold ${
            used ? "text-ink-faint line-through decoration-ink-faint" : "text-ink"
          }`}
        >
          {item.label}
        </span>
      </button>

      {editing ? (
        confirming ? (
          <span className="flex shrink-0 items-center gap-1 pr-2">
            <button
              type="button"
              onClick={onRemove}
              className="min-h-9 rounded-md border border-overdue-line bg-overdue-soft px-2 text-[12px] font-bold text-overdue"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-9 rounded-md px-1.5 text-[12px] font-semibold text-ink-faint hover:text-ink"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${item.label} from the list`}
            className="grid w-11 shrink-0 place-items-center text-ink-faint transition-colors hover:bg-overdue-soft hover:text-overdue"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )
      ) : null}
    </li>
  );
}
