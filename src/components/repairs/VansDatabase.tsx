"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addVan, editVan, removeVan, setVanActive, type VanFields } from "@/lib/db/vans";
import { removeVanQr, uploadVanQr } from "@/lib/db/vanQr";
import { removeAllRegistrations } from "@/lib/db/vanRegistration";
import { RegIcon, RegistrationModal } from "@/components/repairs/VanRegistration";
import { BulkRegButton } from "@/components/repairs/BulkRegistration";
import { EXPIRING_DAYS, activeRegistration } from "@/lib/regDocs";
import { shrinkForUpload } from "@/lib/qrImage";
import {
  BulkQrButton,
  KEEP_QR,
  QrField,
  QrIcon,
  QrModal,
  qrDraftBusy,
  type QrDraft,
} from "@/components/repairs/VanQr";
import { vanKey } from "@/lib/vans";
import { RegistrationEmails } from "@/components/repairs/RegistrationEmails";
import { stationDateKey } from "@/lib/constants";
import {
  daysLeftPhrase,
  daysUntil,
  registrationLabel,
  registrationState,
} from "@/lib/registration";
import type { VanRecord } from "@/lib/types";

/**
 * The vans database — every van, and the things the office gets asked for
 * about one: who it is from, its VIN, the vendor's number for it, and when
 * its registration runs out. The registration date drives the reminder
 * emails — see lib/registration.ts and /api/cron/registration.
 *
 * Typed once by fleet/repairs and read on every job card: a job on BR.03 shows BR.03's
 * VIN, vendor and vendor number under it, looked up live, so a correction here
 * shows on every card at once.
 *
 * A table on a laptop, because columns are what a table is for. Cards on a
 * phone, because five columns at 390px is a table nobody can read.
 *
 * Each van is either with us or returned. The Repairs login flips it with the
 * Yes / No switch at the end of the row; a returned van is kept for the record
 * only — no reminders, no QR — and sinks, greyed, under Returned vans.
 */

const EMPTY: VanFields = {
  van: "",
  vendor: "",
  vin: "",
  vendorNumber: "",
  registrationExpires: "",
};

/**
 * One grid for the heading, the rows and the form, so the columns line up.
 * The Repairs login gets one more column at the end, for the With us switch.
 */
const COLUMNS = "md:grid md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_160px_56px_56px_132px] md:items-center md:gap-3";
const COLUMNS_MANAGED = "md:grid md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_160px_56px_56px_88px_96px] md:items-center md:gap-3";

const FIELDS: {
  key: keyof VanFields;
  label: string;
  /** The column heading, when it is shorter than the label. */
  heading?: string;
  placeholder: string;
  mono?: boolean;
  type?: "date";
}[] = [
  { key: "van", label: "Van #", placeholder: "Van#", mono: true },
  { key: "vendor", label: "Vendor", placeholder: "Vendor" },
  { key: "vin", label: "VIN #", placeholder: "VIN#", mono: true },
  { key: "vendorNumber", label: "Vendor #", placeholder: "Vendor#", mono: true },
  {
    key: "registrationExpires",
    label: "Registration expires",
    heading: "Registration",
    placeholder: "Registration",
    type: "date",
  },
];

export function VansDatabase({
  vans,
  loading,
  canManage,
  canManageQr,
  uid,
  onError,
}: {
  vans: VanRecord[];
  loading: boolean;
  /** May add, change and remove. The Repairs login only. */
  canManage: boolean;
  /**
   * May put up, replace and take down a van's QR code: the Repairs login and
   * the dispatcher. The dispatcher's Edit opens the QR alone — the rest of the
   * van stays the Repairs login's. /api/vans/qr holds the same line.
   */
  canManageQr: boolean;
  uid: string;
  onError: (message: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  /** The van whose row is a form right now, and whether it opened on its QR. */
  const [editing, setEditing] = useState<{ id: string; qrFirst: boolean } | null>(null);
  const editingId = editing?.id ?? null;
  const closeEditor = useCallback(() => setEditing(null), []);
  /** The van whose QR is open in the viewer. */
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = viewingId ? (vans.find((van) => van.id === viewingId) ?? null) : null;
  const closeViewer = useCallback(() => setViewingId(null), []);
  /** The van whose registration modal is open. */
  const [regId, setRegId] = useState<string | null>(null);
  const regVan = regId ? (vans.find((van) => van.id === regId) ?? null) : null;
  const closeReg = useCallback(() => setRegId(null), []);
  /** The two quick filters over the vans still with us. */
  const [filter, setFilter] = useState<"missing" | "expiring" | null>(null);
  /** With us or not: All, Yes (with us) or No (returned). */
  const [status, setStatus] = useState<StatusFilter>("all");
  /** Vans whose QR is uploading or being removed right now. */
  const [qrBusy, setQrBusy] = useState<ReadonlySet<string>>(new Set());
  /** The vans still with us. A returned van's QR and registration no longer matter. */
  const inService = useMemo(() => vans.filter((van) => van.active), [vans]);
  const returnedCount = vans.length - inService.length;
  const missingQr = useMemo(() => inService.filter((van) => !van.qrPath).length, [inService]);
  const columns = canManage ? COLUMNS_MANAGED : COLUMNS;
  /** Today at the station, for how close each registration is. */
  const today = stationDateKey();

  /** Vans with us and no registration document on file for drivers. */
  const missingDoc = useMemo(
    () => new Set(inService.filter((van) => !activeRegistration(van.registrationDocs)).map((van) => van.id)),
    [inService],
  );
  /** Vans with us whose registration has run out or runs out inside 30 days. */
  const expiring = useMemo(
    () =>
      new Set(
        inService
          .filter((van) => van.registrationExpires && daysUntil(van.registrationExpires, today) <= EXPIRING_DAYS)
          .map((van) => van.id),
      ),
    [inService, today],
  );

  /** Registrations run out or inside the reminder window, soonest first. */
  const due = useMemo(
    () =>
      inService
        .filter((van) => {
          const state = registrationState(van.registrationExpires, today);
          return state === "soon" || state === "expired";
        })
        .sort((a, b) => a.registrationExpires.localeCompare(b.registrationExpires)),
    [inService, today],
  );

  /** What the search leaves, split: vans with us first, returned ones under them. */
  const showing = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const pool =
      filter === "missing"
        ? vans.filter((van) => missingDoc.has(van.id))
        : filter === "expiring"
          ? vans
              .filter((van) => expiring.has(van.id))
              .sort((a, b) => a.registrationExpires.localeCompare(b.registrationExpires))
          : vans;
    const inStatus =
      status === "yes"
        ? pool.filter((van) => van.active)
        : status === "no"
          ? pool.filter((van) => !van.active)
          : pool;
    const found =
      words.length === 0
        ? inStatus
        : inStatus.filter((van) => {
            const haystack =
              `${van.van} ${van.key} ${van.vendor} ${van.vin} ${van.vendorNumber} ${registrationLabel(van.registrationExpires)} ${van.qrText ?? ""} ${van.active ? "" : "returned"}`.toLowerCase();
            return words.every((word) => haystack.includes(word));
          });
    return {
      active: found.filter((van) => van.active),
      returned: found.filter((van) => !van.active),
    };
  }, [vans, query, filter, status, missingDoc, expiring]);
  const showingCount = showing.active.length + showing.returned.length;

  /** Same shape as the board's run(): local at once, loud if refused. */
  function run(what: string, write: Promise<unknown>) {
    onError(null);
    write.catch((err: unknown) =>
      onError(err instanceof Error ? `${what}: ${err.message}` : `${what} did not save.`),
    );
  }

  /**
   * Whatever the form's QR field says should happen, sent off after the rest
   * of the van has saved. Awaited, unlike the Firestore writes, so the row can
   * say it is still going — an image is seconds of upload, not a local write.
   */
  function saveQr(van: VanRecord, draft: QrDraft) {
    if (draft.kind === "keep") return;
    const mark = (on: boolean) =>
      setQrBusy((was) => {
        const next = new Set(was);
        if (on) next.add(van.id);
        else next.delete(van.id);
        return next;
      });
    mark(true);
    const work =
      draft.kind === "remove"
        ? removeVanQr(van.id)
        : shrinkForUpload(draft.file).then((image) => uploadVanQr(van.id, image, draft.qrText));
    run(
      draft.kind === "remove" ? `Removing ${van.van}'s QR` : `Saving ${van.van}'s QR`,
      work.finally(() => mark(false)),
    );
  }

  /** A van with a QR or registrations loses the files too — nothing in Storage outlives its van. */
  function deleteVan(van: VanRecord) {
    run(
      "Removing that van",
      (van.qrPath ? removeVanQr(van.id) : Promise.resolve())
        .then(() => (van.registrationDocs.length > 0 ? removeAllRegistrations(van.id) : undefined))
        .then(() => removeVan(van.id)),
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
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Add a van
            </h2>
            <div className="flex flex-wrap justify-end gap-2">
              <BulkRegButton vans={inService} onError={onError} />
              <BulkQrButton vans={inService} onError={onError} />
            </div>
          </div>
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

      {canManage ? <RegistrationEmails vans={inService} uid={uid} onError={onError} /> : null}

      {/* The dispatcher has no Add a van card to hang it on. */}
      {!canManage && canManageQr && inService.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          <BulkRegButton vans={inService} onError={onError} />
          <BulkQrButton vans={inService} onError={onError} />
        </div>
      ) : null}

      {/* Search gets the full width on a phone, counts underneath; side by side from sm up. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="vans-search" className="sr-only">
            Search the vans database
          </label>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            id="vans-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search van, vendor, VIN or QR"
            className="min-h-12 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3.5 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution sm:min-h-11 sm:text-[14px]"
          />
        </div>
        <p className="tnum shrink-0 px-0.5 font-mono text-[13px] font-semibold text-ink-muted sm:px-0">
          {loading ? "" : `${inService.length} ${inService.length === 1 ? "van" : "vans"}`}
          {!loading && inService.length > 0 && missingQr > 0 ? (
            <span className="font-medium text-ink-faint"> · {missingQr} missing QR</span>
          ) : null}
          {!loading && returnedCount > 0 ? (
            <span className="font-medium text-ink-faint"> · {returnedCount} returned</span>
          ) : null}
        </p>
      </div>

      {!loading && vans.length > 0 ? (
        <div className="-mt-1 flex flex-wrap items-center gap-2">
          <StatusFilterGroup
            value={status}
            counts={{ all: vans.length, yes: inService.length, no: returnedCount }}
            onChange={setStatus}
          />
          {inService.length > 0 ? (
            <div role="group" aria-label="Filter by registration" className="flex flex-wrap gap-2">
              <FilterChip
                on={filter === "missing"}
                count={missingDoc.size}
                onClick={() => setFilter((was) => (was === "missing" ? null : "missing"))}
              >
                Missing doc
              </FilterChip>
              <FilterChip
                on={filter === "expiring"}
                count={expiring.size}
                onClick={() => setFilter((was) => (was === "expiring" ? null : "expiring"))}
              >
                Expiring ≤{EXPIRING_DAYS} days
              </FilterChip>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && due.length > 0 ? (
        <div
          role="status"
          className="rounded-xl border border-caution-line bg-caution-soft/60 px-3.5 py-2.5 text-[13px] text-ink"
        >
          <p className="font-semibold text-caution">
            {due.length === 1
              ? "1 registration needs renewing"
              : `${due.length} registrations need renewing`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {due.map((van) => {
              const left = daysUntil(van.registrationExpires, today);
              return (
                <li key={van.id} className="flex flex-wrap gap-x-2">
                  <span className="tnum font-mono font-bold">{van.van}</span>
                  <span className={left < 0 ? "font-semibold text-overdue" : "text-ink-muted"}>
                    {left < 0 ? "expired" : "expires"} {daysLeftPhrase(left)}
                  </span>
                  {van.vendor ? <span className="text-ink-faint">· {van.vendor}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <div
          className="h-48 animate-pulse rounded-xl border border-line bg-surface"
          aria-busy="true"
          aria-label="Loading the vans database"
        />
      ) : vans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center text-[13px] leading-relaxed text-ink-faint">
          {canManage
            ? "No vans in the database yet. Add each one above once — its VIN, vendor and vendor number then show on every job for that van, and its registration date sets off the renewal reminders."
            : "No vans in the database yet. They are added from the Repairs login."}
        </p>
      ) : showingCount === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center text-[13px] text-ink-faint">
          {query.trim()
            ? `No van matches “${query.trim()}”${filter || status !== "all" ? " under these filters" : ""}`
            : status === "no"
              ? filter
                ? "Missing doc and Expiring only look at vans with us — switch With us to All or Yes."
                : "No returned vans."
              : filter === "missing"
                ? "Every van with us has a registration on file."
                : filter === "expiring"
                  ? `No registration runs out in the next ${EXPIRING_DAYS} days.`
                  : "No vans with us right now."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {/* Column headings — laptop only; a phone card labels each value. */}
          <div
            className={`hidden border-b border-line bg-sunken/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint ${columns}`}
          >
            {FIELDS.map((field) => (
              <span key={field.key}>{field.heading ?? field.label}</span>
            ))}
            <span className="text-center">QR</span>
            <span className="text-center">Reg</span>
            <span className="sr-only">Actions</span>
            {canManage ? <span className="text-right">With us</span> : null}
          </div>

          <ul className="divide-y divide-line">
            {[...showing.active, ...showing.returned].map((van, index) => (
              <li key={van.id}>
                {index === showing.active.length ? (
                  <h3 className="border-b border-line bg-sunken/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Returned vans · {showing.returned.length}
                  </h3>
                ) : null}
                {editingId === van.id && canManage ? (
                  <div className="bg-caution-soft/40 p-3">
                    <VanForm
                      idPrefix={`van-${van.id}`}
                      initial={van}
                      submitLabel="Save"
                      clash={(fields) => clash(fields, van.id)}
                      qr={
                        canManageQr && van.active
                          ? { van, focus: editing?.qrFirst ?? false }
                          : undefined
                      }
                      onSubmit={(fields, qr) => {
                        setEditing(null);
                        run("That change", editVan(van.id, fields, uid));
                        saveQr(van, qr);
                      }}
                      onCancel={closeEditor}
                      onDelete={() => {
                        setEditing(null);
                        deleteVan(van);
                      }}
                    />
                  </div>
                ) : editingId === van.id && canManageQr ? (
                  <div className="bg-caution-soft/40 p-3">
                    <QrOnlyForm
                      van={van}
                      onSubmit={(qr) => {
                        setEditing(null);
                        saveQr(van, qr);
                      }}
                      onCancel={closeEditor}
                    />
                  </div>
                ) : (
                  <VanRow
                    van={van}
                    today={today}
                    columns={columns}
                    onActive={
                      canManage
                        ? (active) =>
                            run(
                              active
                                ? `Putting ${van.van} back in service`
                                : `Marking ${van.van} returned`,
                              setVanActive(van.id, active, uid),
                            )
                        : undefined
                    }
                    qrBusy={qrBusy.has(van.id)}
                    onView={() => setViewingId(van.id)}
                    onReg={() => setRegId(van.id)}
                    canManageReg={canManageQr}
                    onAddQr={
                      canManageQr && van.active ? () => setEditing({ id: van.id, qrFirst: true }) : undefined
                    }
                    onEdit={
                      canManage || (canManageQr && van.active)
                        ? () => setEditing({ id: van.id, qrFirst: !canManage })
                        : undefined
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {viewing?.qrPath ? <QrModal van={viewing} onClose={closeViewer} /> : null}
      {regVan ? <RegistrationModal van={regVan} canManage={canManageQr} onClose={closeReg} /> : null}
    </section>
  );
}

/** One van, read-only. */
function VanRow({
  van,
  today,
  columns,
  qrBusy,
  onView,
  onReg,
  canManageReg,
  onAddQr,
  onEdit,
  onActive,
}: {
  van: VanRecord;
  today: string;
  /** The grid this row sits on — one column wider for the Repairs login. */
  columns: string;
  /** Flips With us / Returned; absent for everyone but the Repairs login. */
  onActive?: (active: boolean) => void;
  /** Its QR is uploading or being removed. */
  qrBusy: boolean;
  onView: () => void;
  /** Opens the registration modal. */
  onReg: () => void;
  /** May upload a registration: an empty one reads "Add" rather than "—". */
  canManageReg: boolean;
  /** Opens Edit on the QR field; absent for whoever cannot add one. */
  onAddQr?: () => void;
  onEdit?: () => void;
}) {
  /** Greyed, so the eye skips it; the switch and Edit stay full strength. */
  const faded = van.active ? "" : "opacity-50";
  /** No was pressed and is waiting on "are you sure". */
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const cancelReturn = useCallback(() => setConfirmingReturn(false), []);
  // Esc backs out, the same as closing a sheet.
  useEffect(() => {
    if (!confirmingReturn) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelReturn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmingReturn, cancelReturn]);
  // Marked returned from another screen while this one was asking: nothing left to ask.
  const askingReturn = confirmingReturn && van.active;
  return (
    <div className={`relative px-3 py-3 ${van.active ? "" : "bg-sunken/40"} ${columns}`}>
      <p className={`tnum pr-16 font-mono text-[16px] font-bold text-ink md:pr-0 md:text-[15px] ${faded}`}>
        {van.van}
      </p>
      <dl className={`mt-1.5 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px] md:contents ${faded}`}>
        <Value label="Vendor" value={van.vendor} />
        <Value label="VIN #" value={van.vin} mono />
        <Value label="Vendor #" value={van.vendorNumber} mono />
        <dt className="text-ink-faint md:sr-only">Registration</dt>
        <dd className="min-w-0 md:text-[14px]">
          {van.active ? (
            <Registration expires={van.registrationExpires} today={today} />
          ) : (
            <span className="tnum text-ink-faint">
              {van.registrationExpires ? registrationLabel(van.registrationExpires) : "—"}
            </span>
          )}
        </dd>
        <dt className="text-ink-faint md:sr-only">QR</dt>
        <dd className="min-w-0 md:flex md:justify-center">
          {!van.active ? (
            <span className="text-ink-faint">—</span>
          ) : qrBusy ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted" role="status">
              <span
                aria-hidden="true"
                className="size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-caution motion-reduce:animate-none"
              />
              <span className="md:sr-only">Saving…</span>
            </span>
          ) : van.qrPath ? (
            <button
              type="button"
              onClick={onView}
              aria-label={`Show QR for ${van.van}`}
              title="Show QR"
              className="-my-1 inline-grid size-9 place-items-center rounded-lg border border-line text-ink transition-colors hover:border-line-strong hover:bg-sunken active:bg-sunken"
            >
              <QrIcon className="size-[18px]" />
            </button>
          ) : onAddQr ? (
            <button
              type="button"
              onClick={onAddQr}
              aria-label={`Add a QR for ${van.van}`}
              className="-my-1 -ml-1.5 min-h-9 rounded-md px-1.5 text-[12px] md:ml-0 font-semibold text-ink-faint underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink hover:decoration-ink-faint"
            >
              Add
            </button>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </dd>
        <dt className="text-ink-faint md:sr-only">Reg doc</dt>
        <dd className="min-w-0 md:flex md:justify-center">
          {!van.active ? (
            <span className="text-ink-faint">—</span>
          ) : activeRegistration(van.registrationDocs) ? (
            <button
              type="button"
              onClick={onReg}
              aria-label={`Registration for ${van.van}`}
              title="Registration"
              className="-my-1 inline-grid size-9 place-items-center rounded-lg border border-line text-ink transition-colors hover:border-line-strong hover:bg-sunken active:bg-sunken"
            >
              <RegIcon className="size-[18px]" />
            </button>
          ) : canManageReg ? (
            <button
              type="button"
              onClick={onReg}
              aria-label={`Add a registration for ${van.van}`}
              className="-my-1 -ml-1.5 min-h-9 rounded-md px-1.5 text-[12px] font-semibold text-overdue underline decoration-overdue-line underline-offset-2 transition-colors hover:decoration-overdue md:ml-0"
            >
              Add
            </button>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </dd>
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
      ) : onActive ? (
        <span aria-hidden="true" className="hidden md:block" />
      ) : null}
      {onActive ? (
        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-line pt-2.5 md:mt-0 md:justify-end md:border-0 md:pt-0">
          <span className="text-[13px] text-ink-faint md:sr-only">With us</span>
          <ActiveSwitch
            van={van.van}
            active={van.active}
            pendingNo={askingReturn}
            onChange={(active) => (active ? onActive(true) : setConfirmingReturn(true))}
          />
        </div>
      ) : null}
      {onActive && askingReturn ? (
        <ReturnConfirm
          id={`return-${van.id}`}
          van={van.van}
          onConfirm={() => {
            setConfirmingReturn(false);
            onActive(false);
          }}
          onCancel={cancelReturn}
        />
      ) : null}
    </div>
  );
}

/**
 * "Are you sure?" under the row before a van is marked returned — the same
 * two-step as Remove van. It says what No does, so it is never a slip.
 */
function ReturnConfirm({
  id,
  van,
  onConfirm,
  onCancel,
}: {
  id: string;
  van: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      className="mt-2.5 rounded-lg border border-overdue-line bg-overdue-soft px-3 py-2.5 md:col-span-full md:mt-1 md:flex md:items-center md:justify-between md:gap-4"
    >
      <div className="min-w-0">
        <p id={`${id}-title`} className="text-[13px] font-bold text-ink">
          Mark <span className="tnum font-mono">{van}</span> as returned?
        </p>
        <p id={`${id}-body`} className="mt-0.5 text-[12px] leading-snug text-ink-muted">
          It moves to Returned vans: no renewal reminders, and drivers can no longer pull up its registration. You
          can switch it back to Yes any time.
        </p>
      </div>
      <div className="mt-2.5 flex shrink-0 gap-2 md:mt-0">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-10 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-sunken md:flex-none"
        >
          Keep with us
        </button>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="min-h-10 flex-1 rounded-lg border border-overdue-line bg-surface px-3.5 text-[13px] font-bold text-overdue transition-colors hover:bg-overdue-soft md:flex-none"
        >
          Mark returned
        </button>
      </div>
    </div>
  );
}

type StatusFilter = "all" | "yes" | "no";

/** All / Yes / No over "With us": every van, the vans with us, the returned ones. One is always on. */
function StatusFilterGroup({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (value: StatusFilter) => void;
}) {
  const options: { value: StatusFilter; label: string; hint: string }[] = [
    { value: "all", label: "All", hint: "All vans" },
    { value: "yes", label: "Yes", hint: "Vans with us" },
    { value: "no", label: "No", hint: "Returned vans" },
  ];
  return (
    <div
      role="group"
      aria-label="Filter by with us"
      className="inline-flex min-h-9 items-stretch overflow-hidden rounded-full border border-line-strong bg-surface"
    >
      <span className="flex items-center pl-3 pr-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        With us
      </span>
      {options.map((option) => {
        const on = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            aria-label={`${option.hint}: ${counts[option.value]}`}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-9 items-center gap-1.5 border-l border-line px-3 text-[12px] font-semibold transition-colors focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${
              on ? "bg-ink text-ink-inverse" : "text-ink-muted hover:bg-sunken hover:text-ink"
            }`}
          >
            {option.label}
            <span className={`tnum font-mono ${on ? "text-ink-inverse/80" : "text-ink-faint"}`}>
              {counts[option.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A quick filter: pressed or not, with how many vans it would show. */
function FilterChip({
  on,
  count,
  onClick,
  children,
}: {
  on: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
        on
          ? "border-ink bg-ink text-ink-inverse"
          : "border-line-strong bg-surface text-ink-muted hover:border-ink-faint hover:text-ink"
      }`}
    >
      {children}
      <span className={`tnum font-mono ${on ? "text-ink-inverse/80" : count > 0 ? "text-overdue" : "text-ink-faint"}`}>
        {count}
      </span>
    </button>
  );
}

/**
 * Yes / No, side by side. Yes, tinted green, is a van with us; No is a
 * returned van. Two plain buttons rather than a slider, so each answer is
 * written on the thing you press.
 */
function ActiveSwitch({
  van,
  active,
  pendingNo = false,
  onChange,
}: {
  van: string;
  active: boolean;
  /** No was pressed and is waiting on the confirm under the row. */
  pendingNo?: boolean;
  onChange: (active: boolean) => void;
}) {
  const base =
    "min-h-9 min-w-10 px-2.5 text-[12px] font-bold transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink";
  return (
    <div
      role="group"
      aria-label={`Is ${van} with us?`}
      className="inline-flex overflow-hidden rounded-lg border border-line-strong bg-surface"
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={() => !active && onChange(true)}
        className={`${base} ${
          active
            ? "bg-arrived-soft text-arrived shadow-[inset_0_0_0_1px_var(--color-arrived-line)]"
            : "text-ink-faint hover:bg-sunken hover:text-ink"
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        aria-pressed={!active}
        aria-expanded={active ? pendingNo : undefined}
        onClick={() => active && !pendingNo && onChange(false)}
        className={`${base} border-l border-line-strong ${
          pendingNo
            ? "bg-overdue-soft text-overdue shadow-[inset_0_0_0_1px_var(--color-overdue-line)]"
            : active
              ? "text-ink-faint hover:bg-sunken hover:text-ink"
              : "bg-sunken text-ink"
        }`}
      >
        No
      </button>
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
 * The registration date, and how close it is once that matters: amber inside
 * the reminder window, red once it has run out.
 */
function Registration({ expires, today }: { expires: string; today: string }) {
  const state = registrationState(expires, today);
  if (state === "none") return <span className="text-ink-faint">—</span>;

  const left = daysUntil(expires, today);
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className={`tnum ${state === "expired" ? "font-semibold text-overdue" : "text-ink"}`}>
        {registrationLabel(expires)}
      </span>
      {state === "soon" ? (
        <span className="rounded-md border border-caution-line bg-caution-soft px-1.5 py-px text-[11px] font-bold text-caution">
          {left === 0 ? "Today" : `${left}d left`}
        </span>
      ) : state === "expired" ? (
        <span className="rounded-md border border-overdue-line bg-overdue-soft px-1.5 py-px text-[11px] font-bold text-overdue">
          Expired
        </span>
      ) : null}
    </span>
  );
}

/**
 * The five fields, for adding a van or changing one.
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
  qr,
  resetOnSubmit = false,
}: {
  idPrefix: string;
  initial: VanFields;
  submitLabel: string;
  /** The van already answering to this number, which blocks saving. */
  clash: (fields: VanFields) => VanRecord | null;
  onSubmit: (fields: VanFields, qr: QrDraft) => void;
  /** Show the QR field for this van, focused when the row was opened by its Add link. */
  qr?: { van: VanRecord; focus: boolean };
  onCancel?: () => void;
  onDelete?: () => void;
  resetOnSubmit?: boolean;
}) {
  const [fields, setFields] = useState<VanFields>({
    van: initial.van,
    vendor: initial.vendor,
    vin: initial.vin,
    vendorNumber: initial.vendorNumber,
    registrationExpires: initial.registrationExpires,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [qrDraft, setQrDraft] = useState<QrDraft>(KEEP_QR);
  const taken = clash(fields);
  const ready = fields.van.trim() !== "" && taken === null && !qrDraftBusy(qrDraft);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit(fields, qrDraft);
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
      <div className={`grid grid-cols-2 gap-2 ${COLUMNS_MANAGED}`}>
        {FIELDS.map((field) => (
          <div
            key={field.key}
            className={`min-w-0 ${field.type === "date" ? "col-span-2 md:col-span-1" : ""}`}
          >
            <label
              htmlFor={`${idPrefix}-${field.key}`}
              className="mb-1 block text-[11px] font-semibold text-ink-faint md:sr-only"
            >
              {field.label}
            </label>
            <input
              id={`${idPrefix}-${field.key}`}
              type={field.type ?? "text"}
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

        {/* The QR and Reg columns, kept so the buttons stay under Edit. */}
        <span aria-hidden="true" className="hidden md:block" />
        <span aria-hidden="true" className="hidden md:block" />

        <div className="col-span-2 flex items-center justify-end gap-1.5">
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

      {qr ? (
        <div className="mt-3 border-t border-caution-line/50 pt-3">
          <QrField van={qr.van} draft={qrDraft} setDraft={setQrDraft} autoFocus={qr.focus} />
        </div>
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

/**
 * The dispatcher's Edit: the van's QR and nothing else. The rest of the van
 * is the Repairs login's — see canManageQr.
 */
function QrOnlyForm({
  van,
  onSubmit,
  onCancel,
}: {
  van: VanRecord;
  onSubmit: (qr: QrDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<QrDraft>(KEEP_QR);
  const ready = draft.kind !== "keep" && !qrDraftBusy(draft);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <p className="tnum mb-2.5 font-mono text-[15px] font-bold text-ink">{van.van}</p>
      <QrField van={van} draft={draft} setDraft={setDraft} autoFocus />
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!ready}
          className="min-h-11 rounded-lg border border-caution-line bg-caution-soft px-4 text-[13px] font-bold text-caution transition-[filter] active:brightness-[0.97] disabled:opacity-45"
        >
          Save
        </button>
      </div>
    </form>
  );
}
