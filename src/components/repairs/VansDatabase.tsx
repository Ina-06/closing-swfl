"use client";

import { useMemo, useState } from "react";
import { addVan, editVan, removeVan, type VanFields } from "@/lib/db/vans";
import { vanKey } from "@/lib/vans";
import type { VanRecord } from "@/lib/types";

/**
 * The vans database — every van, and the three things the office gets asked
 * for about one: who it is from, its VIN, and the vendor's number for it.
 *
 * Typed once by Issam and read on every job card: a job on BR.03 shows BR.03's
 * VIN, vendor and vendor number under it, looked up live, so a correction here
 * shows on every card at once.
 *
 * A table on a laptop, because four columns is what a table is for. Cards on a
 * phone, because four columns at 390px is a table nobody can read.
 */

const EMPTY: VanFields = { van: "", vendor: "", vin: "", vendorNumber: "" };

/** One grid for the heading, the rows and the form, so the columns line up. */
const COLUMNS = "md:grid md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_132px] md:items-center md:gap-3";

const FIELDS: {
  key: keyof VanFields;
  label: string;
  placeholder: string;
  mono?: boolean;
}[] = [
  { key: "van", label: "Van #", placeholder: "BR.03", mono: true },
  { key: "vendor", label: "Vendor", placeholder: "Vendor" },
  { key: "vin", label: "VIN #", placeholder: "17-character VIN", mono: true },
  { key: "vendorNumber", label: "Vendor #", placeholder: "Vendor number", mono: true },
];

export function VansDatabase({
  vans,
  loading,
  canManage,
  uid,
  onError,
}: {
  vans: VanRecord[];
  loading: boolean;
  /** May add, change and remove. The Repairs login only. */
  canManage: boolean;
  uid: string;
  onError: (message: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  /** The van whose row is a form right now. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const showing = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return vans;
    return vans.filter((van) => {
      const haystack =
        `${van.van} ${van.key} ${van.vendor} ${van.vin} ${van.vendorNumber}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [vans, query]);

  /** Same shape as the board's run(): local at once, loud if refused. */
  function run(what: string, write: Promise<unknown>) {
    onError(null);
    write.catch((err: unknown) =>
      onError(err instanceof Error ? `${what}: ${err.message}` : `${what} did not save.`),
    );
  }

  /** Another van already answering to this number, if there is one. */
  function clash(fields: VanFields, ignoreId: string | null): VanRecord | null {
    const key = vanKey(fields.van);
    if (!key) return null;
    return vans.find((van) => van.key === key && van.id !== ignoreId) ?? null;
  }

  return (
    <section aria-label="Vans database" className="space-y-4">
      {canManage ? (
        <div className="rounded-xl border border-line bg-surface p-3">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Add a van
          </h2>
          <VanForm
            idPrefix="van-add"
            initial={EMPTY}
            submitLabel="Add"
            clash={(fields) => clash(fields, null)}
            onSubmit={(fields) => run("Adding that van", addVan(fields, uid))}
            resetOnSubmit
          />
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="vans-search" className="sr-only">
            Search the vans database
          </label>
          <input
            id="vans-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search van, vendor or VIN"
            className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution sm:text-[14px]"
          />
        </div>
        <p className="tnum shrink-0 font-mono text-[13px] font-semibold text-ink-muted">
          {loading ? "" : `${vans.length} ${vans.length === 1 ? "van" : "vans"}`}
        </p>
      </div>

      {loading ? (
        <div
          className="h-48 animate-pulse rounded-xl border border-line bg-surface"
          aria-busy="true"
          aria-label="Loading the vans database"
        />
      ) : vans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center text-[13px] leading-relaxed text-ink-faint">
          {canManage
            ? "No vans in the database yet. Add each one above once — its VIN, vendor and vendor number then show on every job for that van."
            : "No vans in the database yet. They are added from the Repairs login."}
        </p>
      ) : showing.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center text-[13px] text-ink-faint">
          No van matches &ldquo;{query.trim()}&rdquo;
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {/* Column headings — laptop only; a phone card labels each value. */}
          <div
            className={`hidden border-b border-line bg-sunken/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint ${COLUMNS}`}
          >
            {FIELDS.map((field) => (
              <span key={field.key}>{field.label}</span>
            ))}
            <span className="sr-only">Actions</span>
          </div>

          <ul className="divide-y divide-line">
            {showing.map((van) => (
              <li key={van.id}>
                {editingId === van.id ? (
                  <div className="bg-caution-soft/40 p-3">
                    <VanForm
                      idPrefix={`van-${van.id}`}
                      initial={van}
                      submitLabel="Save"
                      clash={(fields) => clash(fields, van.id)}
                      onSubmit={(fields) => {
                        setEditingId(null);
                        run("That change", editVan(van.id, fields, uid));
                      }}
                      onCancel={() => setEditingId(null)}
                      onDelete={() => {
                        setEditingId(null);
                        run("Removing that van", removeVan(van.id));
                      }}
                    />
                  </div>
                ) : (
                  <VanRow
                    van={van}
                    onEdit={canManage ? () => setEditingId(van.id) : undefined}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One van, read-only. */
function VanRow({ van, onEdit }: { van: VanRecord; onEdit?: () => void }) {
  return (
    <div className={`relative px-3 py-3 ${COLUMNS}`}>
      <p className="tnum pr-16 font-mono text-[16px] font-bold text-ink md:pr-0 md:text-[15px]">
        {van.van}
      </p>
      <dl className="mt-1.5 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px] md:contents">
        <Value label="Vendor" value={van.vendor} />
        <Value label="VIN #" value={van.vin} mono />
        <Value label="Vendor #" value={van.vendorNumber} mono />
      </dl>
      {onEdit ? (
        <div className="absolute right-2 top-2 md:static md:flex md:justify-end">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${van.van}`}
            className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-sunken active:bg-sunken"
          >
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Value({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-ink-faint md:sr-only">{label}</dt>
      <dd
        className={`min-w-0 break-all text-ink md:text-[14px] ${mono ? "tnum font-mono" : ""} ${
          value ? "" : "text-ink-faint"
        }`}
      >
        {value || "—"}
      </dd>
    </>
  );
}

/**
 * The four fields, for adding a van or changing one.
 *
 * Laid on the same grid as the rows on a laptop, so a van being edited stays
 * in its columns. On a phone it is two by two with the buttons underneath.
 */
function VanForm({
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
  initial: VanFields;
  submitLabel: string;
  /** The van already answering to this number, which blocks saving. */
  clash: (fields: VanFields) => VanRecord | null;
  onSubmit: (fields: VanFields) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  resetOnSubmit?: boolean;
}) {
  const [fields, setFields] = useState<VanFields>({
    van: initial.van,
    vendor: initial.vendor,
    vin: initial.vin,
    vendorNumber: initial.vendorNumber,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const taken = clash(fields);
  const ready = fields.van.trim() !== "" && taken === null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit(fields);
        if (resetOnSubmit) {
          setFields(EMPTY);
          // Back to the van number, ready for the next one.
          document.getElementById(`${idPrefix}-van`)?.focus();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onCancel) onCancel();
      }}
    >
      <div className={`grid grid-cols-2 gap-2 ${COLUMNS}`}>
        {FIELDS.map((field) => (
          <div key={field.key} className="min-w-0">
            <label
              htmlFor={`${idPrefix}-${field.key}`}
              className="mb-1 block text-[11px] font-semibold text-ink-faint md:sr-only"
            >
              {field.label}
            </label>
            <input
              id={`${idPrefix}-${field.key}`}
              value={fields[field.key]}
              onChange={(event) =>
                setFields((was) => ({ ...was, [field.key]: event.target.value }))
              }
              placeholder={field.placeholder}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize={field.mono ? "characters" : "words"}
              aria-label={field.label}
              className={`min-h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution md:text-[14px] ${
                field.mono ? "tnum font-mono" : ""
              }`}
            />
          </div>
        ))}

        <div className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              Cancel
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
          {taken.van} is already in the database.
        </p>
      ) : null}

      {onDelete ? (
        <div className="mt-2.5 flex items-center gap-2 border-t border-caution-line/50 pt-2.5">
          {confirmingDelete ? (
            <>
              <span className="text-[12px] text-ink-muted">Remove this van for good?</span>
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
              Remove van
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
