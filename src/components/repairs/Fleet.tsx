"use client";

import { useState } from "react";
import { addFleetItem, removeFleetItem, setFleetUsed } from "@/lib/db/fleet";
import { vanKey } from "@/lib/vans";
import type { FleetItem, FleetKind } from "@/lib/types";

/**
 * Available vans and gas cards — today's spares, as two to-do lists.
 *
 * Issam types them in one by one. Whoever uses one — Issam after launch, or
 * the closer on a van switch at nine o'clock — ticks it off, and it sinks
 * under "Used today", struck through, still there to un-tick if the wrong one
 * was caught. What is left on top is what is still in the yard and in the
 * drawer.
 *
 * Vans first, gas cards under them — on the board and in the closer's
 * dropdown alike. They work the same way, but somebody reaching for a spare
 * van should not have to read past the cards to find one. Nothing here is
 * linked to the vans database.
 *
 * The lists belong to the session. When Karim ends the day they empty on
 * their own — or when the dispatcher starts the next day, if End Day never
 * happened — so there is no "clear" button to forget to press. See
 * lib/fleetRound.
 */

export const FLEET_KINDS: {
  kind: FleetKind;
  label: string;
  placeholder: string;
}[] = [
  { kind: "van", label: "Vans", placeholder: "Van, e.g. BR.03" },
  { kind: "gasCard", label: "Gas cards", placeholder: "Gas card, e.g. 1142" },
];

/** Available and used, worked out once for the counts and the lists. */
export function splitFleet(items: FleetItem[], kind?: FleetKind) {
  const mine = kind ? items.filter((item) => item.kind === kind) : items;
  return {
    spare: mine.filter((item) => !item.used),
    used: mine.filter((item) => item.used),
  };
}

/** Both lists, as a tab of the repairs board. */
export function AvailableList({
  items,
  loading,
  round,
  canManage,
  uid,
  onError,
}: {
  items: FleetItem[];
  loading: boolean;
  /** The current round, or null until it is known — see useAvailable. */
  round: string | null;
  /**
   * May add and remove, not just tick. The Repairs login only — Karim
   * crossing over from the close ticks them off and that is all.
   */
  canManage: boolean;
  uid: string;
  onError: (message: string | null) => void;
}) {
  if (loading) {
    return (
      <div
        className="h-40 max-w-2xl animate-pulse rounded-xl bg-sunken/60"
        aria-busy="true"
        aria-label="Loading the available vans and gas cards"
      />
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {FLEET_KINDS.map((option) => (
        <KindList
          key={option.kind}
          kind={option.kind}
          label={option.label}
          placeholder={option.placeholder}
          items={items.filter((item) => item.kind === option.kind)}
          round={round}
          canManage={canManage}
          uid={uid}
          onError={onError}
        />
      ))}
    </div>
  );
}

/** One of the two lists: its count, its add box, and its rows. */
function KindList({
  kind,
  label,
  placeholder,
  items,
  round,
  canManage,
  uid,
  onError,
}: {
  kind: FleetKind;
  label: string;
  placeholder: string;
  items: FleetItem[];
  round: string | null;
  canManage: boolean;
  uid: string;
  onError: (message: string | null) => void;
}) {
  const { spare, used } = splitFleet(items);
  /** Remove buttons showing. Off by default so a tick never lands on one. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const total = items.length;
  const fieldId = `fleet-add-${kind}`;

  const draftKey = vanKey(draft);
  const duplicate =
    draftKey !== "" && items.some((item) => vanKey(item.label) === draftKey);

  /** Same shape as the board's run(): local at once, loud if refused. */
  function run(what: string, write: Promise<unknown>) {
    onError(null);
    write.catch((err: unknown) =>
      onError(err instanceof Error ? `${what}: ${err.message}` : `${what} did not save.`),
    );
  }

  function add() {
    const typed = draft.trim();
    if (!typed || duplicate || round === null) return;
    setDraft("");
    run("Adding that", addFleetItem(kind, typed, round, uid));
  }

  const remove = (item: FleetItem) =>
    canManage && editing
      ? () => run("Removing that", removeFleetItem(item.id))
      : undefined;

  return (
    <section aria-label={`Available ${label.toLowerCase()}`} className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="leading-none">
          <span className="text-[17px] font-bold tracking-tight text-ink">
            {label}
          </span>
          {/* The number this list exists for. */}
          <span className="tnum ml-2 font-mono text-[15px] font-bold text-arrived">
            {spare.length}
          </span>
          <span className="ml-1 text-[13px] font-semibold text-ink-muted">
            available of {total}
          </span>
        </h2>
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

      {/* Above the rows, so the field stays put under the thumb while Issam
          types the list in one after another, and the keyboard never covers
          what he has just added. */}
      {canManage ? (
        <div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <label htmlFor={fieldId} className="sr-only">
              Add to {label.toLowerCase()}
            </label>
            {/* 16px on the field itself, or iOS zooms the page on focus. */}
            <input
              id={fieldId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="enter"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3.5 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution"
            />
            <button
              type="submit"
              disabled={!draft.trim() || duplicate || round === null}
              className="min-h-12 shrink-0 rounded-xl border border-caution-line bg-caution-soft px-4 text-[14px] font-bold text-caution transition-[filter] active:brightness-[0.97] disabled:opacity-45"
            >
              Add
            </button>
          </form>
          {duplicate ? (
            <p className="mt-1.5 text-[12px] text-ink-faint">Already on the list.</p>
          ) : null}
        </div>
      ) : null}

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] leading-relaxed text-ink-faint">
          {canManage
            ? `No ${label.toLowerCase()} on today's list yet. Type each spare above, one at a time. The list empties on its own when the day ends.`
            : `No ${label.toLowerCase()} on today's list yet. It is written from the Repairs login.`}
        </p>
      ) : (
        <div className="space-y-3">
          <FleetGroup title="Available" count={spare.length}>
            {spare.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-ink-faint">
                Every one on the list has been used today.
              </p>
            ) : (
              spare.map((item) => (
                <FleetRow
                  key={item.id}
                  item={item}
                  onToggle={() =>
                    run("Ticking that off", setFleetUsed(item.id, true, uid))
                  }
                  onRemove={remove(item)}
                />
              ))
            )}
          </FleetGroup>

          {used.length > 0 ? (
            <FleetGroup title="Used today" count={used.length}>
              {used.map((item) => (
                <FleetRow
                  key={item.id}
                  item={item}
                  onToggle={() =>
                    run("Putting that back", setFleetUsed(item.id, false, uid))
                  }
                  onRemove={remove(item)}
                />
              ))}
            </FleetGroup>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** A titled run of rows — "Available" or "Used today". */
export function FleetGroup({
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
 * thing anybody does here once the list is written — the remove button only
 * appears in Edit list, so a thumb working down twenty lines cannot land on
 * it.
 *
 * Shared with the closer's dropdown, so a tick looks the same from both sides
 * of the door.
 */
export function FleetRow({
  item,
  onToggle,
  onRemove,
}: {
  item: FleetItem;
  onToggle: () => void;
  /** Shown only while the list is being edited. */
  onRemove?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const used = item.used;

  return (
    <li className="flex items-stretch bg-surface">
      <button
        type="button"
        role="checkbox"
        aria-checked={used}
        aria-label={`${used ? "Put back as available" : "Used today"}: ${item.label}`}
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

      {onRemove ? (
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
