"use client";

import { useCallback, useMemo, useState } from "react";
import { addVan, editVan, removeVan, type VanFields } from "@/lib/db/vans";
import { removeVanQr, uploadVanQr } from "@/lib/db/vanQr";
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
 */

const EMPTY: VanFields = {
  van: "",
  vendor: "",
  vin: "",
  vendorNumber: "",
  registrationExpires: "",
};

/** One grid for the heading, the rows and the form, so the columns line up. */
const COLUMNS = "md:grid md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_160px_56px_132px] md:items-center md:gap-3";

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
  /** Vans whose QR is uploading or being removed right now. */
  const [qrBusy, setQrBusy] = useState<ReadonlySet<string>>(new Set());
  const missingQr = useMemo(() => vans.filter((van) => !van.qrPath).length, [vans]);
  /** Today at the station, for how close each registration is. */
  const today = stationDateKey();

  /** Registrations run out or inside the reminder window, soonest first. */
  const due = useMemo(
    () =>
      vans
        .filter((van) => {
          const state = registrationState(van.registrationExpires, today);
          return state === "soon" || state === "expired";
        })
        .sort((a, b) => a.registrationExpires.localeCompare(b.registrationExpires)),
    [vans, today],
  );

  const showing = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return vans;
    return vans.filter((van) => {
      const haystack =
        `${van.van} ${van.key} ${van.vendor} ${van.vin} ${van.vendorNumber} ${registrationLabel(van.registrationExpires)} ${van.qrText ?? ""}`.toLowerCase();
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

  /** A van with a QR loses the image too — nothing in Storage outlives its van. */
  function deleteVan(van: VanRecord) {
    run(
      "Removing that van",
      (van.qrPath ? removeVanQr(van.id) : Promise.resolve()).then(() => removeVan(van.id)),
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
            <BulkQrButton vans={vans} onError={onError} />
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

      {canManage ? <RegistrationEmails vans={vans} uid={uid} onError={onError} /> : null}

      {/* The dispatcher has no Add a van card to hang it on. */}
      {!canManage && canManageQr && vans.length > 0 ? (
        <div className="flex justify-end">
          <BulkQrButton vans={vans} onError={onError} />
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
            placeholder="Search van, vendor, VIN or QR"
            className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution sm:text-[14px]"
          />
        </div>
        <p className="tnum shrink-0 font-mono text-[13px] font-semibold text-ink-muted">
          {loading ? "" : `${vans.length} ${vans.length === 1 ? "van" : "vans"}`}
          {!loading && vans.length > 0 && missingQr > 0 ? (
            <span className="font-medium text-ink-faint"> · {missingQr} missing QR</span>
          ) : null}
        </p>
      </div>

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
              <span key={field.key}>{field.heading ?? field.label}</span>
            ))}
            <span className="text-center">QR</span>
            <span className="sr-only">Actions</span>
          </div>

          <ul className="divide-y divide-line">
            {showing.map((van) => (
              <li key={van.id}>
                {editingId === van.id && canManage ? (
                  <div className="bg-caution-soft/40 p-3">
                    <VanForm
                      idPrefix={`van-${van.id}`}
                      initial={van}
                      submitLabel="Save"
                      clash={(fields) => clash(fields, van.id)}
                      qr={canManageQr ? { van, focus: editing?.qrFirst ?? false } : undefined}
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
                    qrBusy={qrBusy.has(van.id)}
                    onView={() => setViewingId(van.id)}
                    onAddQr={
                      canManageQr ? () => setEditing({ id: van.id, qrFirst: true }) : undefined
                    }
                    onEdit={
                      canManage || canManageQr
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
    </section>
  );
}

/** One van, read-only. */
function VanRow({
  van,
  today,
  qrBusy,
  onView,
  onAddQr,
  onEdit,
}: {
  van: VanRecord;
  today: string;
  /** Its QR is uploading or being removed. */
  qrBusy: boolean;
  onView: () => void;
  /** Opens Edit on the QR field; absent for whoever cannot add one. */
  onAddQr?: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className={`relative px-3 py-3 ${COLUMNS}`}>
      <p className="tnum pr-16 font-mono text-[16px] font-bold text-ink md:pr-0 md:text-[15px]">
        {van.van}
      </p>
      <dl className="mt-1.5 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px] md:contents">
        <Value label="Vendor" value={van.vendor} />
        <Value label="VIN #" value={van.vin} mono />
        <Value label="Vendor #" value={van.vendorNumber} mono />
        <dt className="text-ink-faint md:sr-only">Registration</dt>
        <dd className="min-w-0 md:text-[14px]">
          <Registration expires={van.registrationExpires} today={today} />
        </dd>
        <dt className="text-ink-faint md:sr-only">QR</dt>
        <dd className="min-w-0 md:flex md:justify-center">
          {qrBusy ? (
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
      <div className={`grid grid-cols-2 gap-2 ${COLUMNS}`}>
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

        {/* The QR column, kept so the buttons stay under Edit. */}
        <span aria-hidden="true" className="hidden md:block" />

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
