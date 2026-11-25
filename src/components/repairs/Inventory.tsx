"use client";

import { useMemo, useState } from "react";
import {
  addItem,
  editItem,
  isLow,
  removeItem,
  setQuantity,
  stepQuantity,
  type InventoryFields,
} from "@/lib/db/inventory";
import type { InventoryItem } from "@/lib/types";

/**
 * The MT inventory — parts kept on site, how many are on the shelf, and the
 * fewest there should ever be.
 *
 * Two ways in, one list. `full` is the Repairs login and the closer: add an item,
 * rename it, change its minimum, remove it. `countOnly` is the MT portal: the
 * team walks the shelves and the only thing they can touch is the number.
 * `readOnly` is the dispatcher crossed over from their side: they see the
 * list and the counts and change nothing.
 * firestore.rules draws the same line, so hiding the controls is courtesy and
 * not the boundary.
 *
 * Alphabetical and never re-sorted by stock, so a row does not jump out from
 * under a thumb mid-count. Low items are marked in place, and "Low only"
 * narrows the list to them.
 */

const EMPTY: InventoryFields = { name: "", quantity: 0, minQuantity: 0 };

export function Inventory({
  items,
  loading,
  mode,
  uid,
  onError,
}: {
  items: InventoryItem[];
  loading: boolean;
  mode: "full" | "countOnly" | "readOnly";
  uid: string;
  onError: (message: string | null) => void;
}) {
  const full = mode === "full";
  const canCount = mode !== "readOnly";
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const lowCount = useMemo(() => items.filter(isLow).length, [items]);

  const showing = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(
      (item) =>
        (!lowOnly || isLow(item)) &&
        words.every((word) => item.name.toLowerCase().includes(word)),
    );
  }, [items, query, lowOnly]);

  /** Local at once, loud if refused — the board's run(). */
  function run(what: string, write: Promise<unknown>) {
    onError(null);
    write.catch((err: unknown) =>
      onError(err instanceof Error ? `${what}: ${err.message}` : `${what} did not save.`),
    );
  }

  /** Another item already called this, which blocks saving. */
  function clash(name: string, ignoreId: string | null): InventoryItem | null {
    const key = name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) return null;
    return (
      items.find(
        (item) => item.id !== ignoreId && item.name.toLowerCase() === key,
      ) ?? null
    );
  }

  return (
    <section aria-label="MT inventory" className="space-y-4">
      {full ? (
        adding ? (
          <div className="rounded-xl border border-caution-line bg-surface p-3">
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              New item
            </h2>
            <ItemForm
              idPrefix="item-add"
              initial={EMPTY}
              submitLabel="Add item"
              clash={(name) => clash(name, null)}
              onSubmit={(fields) => run("Adding that item", addItem(fields, uid))}
              onCancel={() => setAdding(false)}
              resetOnSubmit
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-caution-line bg-caution-soft/50 text-[15px] font-bold text-caution transition-[filter] active:brightness-[0.97]"
          >
            <span aria-hidden="true" className="text-[18px] leading-none">
              +
            </span>
            Item
          </button>
        )
      ) : null}

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="inventory-search" className="sr-only">
            Search the inventory
          </label>
          <input
            id="inventory-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search items"
            className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution sm:text-[14px]"
          />
        </div>
        <button
          type="button"
          aria-pressed={lowOnly}
          onClick={() => setLowOnly((on) => !on)}
          disabled={lowCount === 0 && !lowOnly}
          className={`min-h-11 shrink-0 rounded-xl border px-3 text-[13px] font-bold transition-colors disabled:opacity-45 ${
            lowOnly
              ? "border-overdue bg-overdue-soft text-overdue"
              : lowCount > 0
                ? "border-overdue-line bg-surface text-overdue"
                : "border-line bg-surface text-ink-faint"
          }`}
        >
          <span className="tnum font-mono">{loading ? "–" : lowCount}</span> low
        </button>
      </div>

      {loading ? (
        <div
          className="h-48 animate-pulse rounded-xl border border-line bg-surface"
          aria-busy="true"
          aria-label="Loading the inventory"
        />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center text-[13px] leading-relaxed text-ink-faint">
          {full
            ? "Nothing in the inventory yet. Press + Item to add the first one — its name, how many are on site, and the minimum there should be."
            : canCount
              ? "Nothing in the inventory yet. Items are added from the Repairs side."
              : "Nothing in the inventory yet."}
        </p>
      ) : showing.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center text-[13px] text-ink-faint">
          {lowOnly && !query.trim()
            ? "Nothing is below its minimum."
            : <>No item matches &ldquo;{query.trim()}&rdquo;</>}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {showing.map((item) => (
            <li key={item.id}>
              {full && editingId === item.id ? (
                <div className="bg-caution-soft/40 p-3">
                  <ItemForm
                    idPrefix={`item-${item.id}`}
                    initial={item}
                    submitLabel="Save"
                    clash={(name) => clash(name, item.id)}
                    onSubmit={(fields) => {
                      setEditingId(null);
                      run("That change", editItem(item.id, fields, uid));
                    }}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => {
                      setEditingId(null);
                      run("Removing that item", removeItem(item.id));
                    }}
                  />
                </div>
              ) : (
                <ItemRow
                  item={item}
                  onEdit={full ? () => setEditingId(item.id) : undefined}
                  onStep={
                    canCount
                      ? (by) => run("That count", stepQuantity(item.id, by, uid))
                      : undefined
                  }
                  onSet={
                    canCount
                      ? (quantity) =>
                          run("That count", setQuantity(item.id, quantity, uid))
                      : undefined
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One item: name and minimum on the left, the count on the right. */
function ItemRow({
  item,
  onEdit,
  onStep,
  onSet,
}: {
  item: InventoryItem;
  onEdit?: () => void;
  onStep?: (by: 1 | -1) => void;
  onSet?: (quantity: number) => void;
}) {
  const low = isLow(item);

  return (
    <div
      className={`flex items-center gap-3 px-3 py-3 ${
        low ? "bg-overdue-soft/40" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] font-bold leading-snug text-ink">
          {item.name}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
          <span>
            Min <span className="tnum font-mono font-semibold">{item.minQuantity}</span>
          </span>
          {low ? (
            <span className="rounded-full border border-overdue-line bg-overdue-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-overdue">
              Low · need {item.minQuantity - item.quantity}
            </span>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${item.name}`}
              className="min-h-8 rounded-md border border-line px-2.5 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-sunken active:bg-sunken"
            >
              Edit
            </button>
          ) : null}
        </p>
      </div>

      {onStep && onSet ? (
        <Counter item={item} low={low} onStep={onStep} onSet={onSet} />
      ) : (
        <span
          aria-label={`${item.quantity} ${item.name} on site`}
          className={`tnum grid h-11 min-w-14 shrink-0 place-items-center rounded-lg border bg-sunken px-3 font-mono text-[18px] font-bold ${
            low ? "border-overdue-line text-overdue" : "border-line text-ink"
          }`}
        >
          {item.quantity}
        </span>
      )}
    </div>
  );
}

/**
 * − [12] +, thumb-sized. The steppers write at once; the number can also be
 * typed straight in, which saves on Enter or leaving the box.
 */
function Counter({
  item,
  low,
  onStep,
  onSet,
}: {
  item: InventoryItem;
  low: boolean;
  onStep: (by: 1 | -1) => void;
  onSet: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(item.quantity);

  function commit() {
    if (draft === null) return;
    const next = draft.trim() === "" ? item.quantity : Number(draft);
    setDraft(null);
    if (Number.isInteger(next) && next >= 0 && next !== item.quantity) onSet(next);
  }

  const stepper =
    "grid size-11 place-items-center rounded-lg border border-line-strong bg-surface text-[20px] font-bold text-ink-muted transition-colors active:bg-sunken disabled:opacity-40";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={`One fewer ${item.name}`}
        disabled={item.quantity <= 0}
        onClick={() => onStep(-1)}
        className={stepper}
      >
        −
      </button>
      <input
        value={shown}
        inputMode="numeric"
        aria-label={`Quantity of ${item.name}`}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) =>
          setDraft(event.target.value.replace(/\D/g, "").slice(0, 5))
        }
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className={`tnum h-11 w-14 rounded-lg border bg-surface text-center font-mono text-[18px] font-bold outline-none transition-colors focus:border-caution ${
          low ? "border-overdue-line text-overdue" : "border-line-strong text-ink"
        }`}
      />
      <button
        type="button"
        aria-label={`One more ${item.name}`}
        onClick={() => onStep(1)}
        className={stepper}
      >
        +
      </button>
    </div>
  );
}

/** Name, quantity and minimum — for adding an item or changing one. */
function ItemForm({
  idPrefix,
  initial,
  submitLabel,
  clash,
  onSubmit,
  onCancel,
  onDelete,
  resetOnSubmit = false,
}: {
  idPrefix: string;
  initial: InventoryFields;
  submitLabel: string;
  clash: (name: string) => InventoryItem | null;
  onSubmit: (fields: InventoryFields) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  resetOnSubmit?: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [quantity, setQty] = useState(String(initial.quantity));
  const [minQuantity, setMin] = useState(String(initial.minQuantity));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const taken = clash(name);
  const ready =
    name.trim() !== "" && quantity !== "" && minQuantity !== "" && taken === null;

  const input =
    "min-h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution md:text-[14px]";
  const label = "mb-1 block text-[11px] font-semibold text-ink-faint";
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 5);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit({
          name,
          quantity: Number(quantity),
          minQuantity: Number(minQuantity),
        });
        if (resetOnSubmit) {
          setName("");
          setQty("0");
          setMin("0");
          document.getElementById(`${idPrefix}-name`)?.focus();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onCancel) onCancel();
      }}
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_110px_110px_auto] md:items-end">
        <div className="col-span-2 min-w-0 md:col-span-1">
          <label htmlFor={`${idPrefix}-name`} className={label}>
            Item name
          </label>
          <input
            id={`${idPrefix}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Headlight bulbs"
            autoComplete="off"
            autoCapitalize="words"
            autoFocus
            className={input}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-qty`} className={label}>
            Quantity on site
          </label>
          <input
            id={`${idPrefix}-qty`}
            value={quantity}
            inputMode="numeric"
            onChange={(event) => setQty(digits(event.target.value))}
            onFocus={(event) => event.currentTarget.select()}
            className={`${input} tnum font-mono`}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-min`} className={label}>
            Minimum
          </label>
          <input
            id={`${idPrefix}-min`}
            value={minQuantity}
            inputMode="numeric"
            onChange={(event) => setMin(digits(event.target.value))}
            onFocus={(event) => event.currentTarget.select()}
            className={`${input} tnum font-mono`}
          />
        </div>

        <div className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              {resetOnSubmit ? "Done" : "Cancel"}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!ready}
            className="min-h-11 flex-1 rounded-lg border border-caution-line bg-caution-soft px-4 text-[13px] font-bold text-caution transition-[filter] active:brightness-[0.97] disabled:opacity-45 md:flex-none"
          >
            {submitLabel}
          </button>
        </div>
      </div>

      {taken ? (
        <p className="mt-2 text-[12px] text-overdue">
          {taken.name} is already in the inventory.
        </p>
      ) : null}

      {onDelete ? (
        <div className="mt-2.5 flex items-center gap-2 border-t border-caution-line/50 pt-2.5">
          {confirmingDelete ? (
            <>
              <span className="text-[12px] text-ink-muted">Remove this item for good?</span>
              <button
                type="button"
                onClick={onDelete}
                className="min-h-9 rounded-md border border-overdue-line bg-overdue-soft px-2.5 text-[12px] font-bold text-overdue"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="min-h-9 rounded-md px-2 text-[12px] font-semibold text-ink-faint hover:text-ink"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-9 rounded-md px-1 text-[12px] font-semibold text-overdue hover:underline"
            >
              Remove item
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
