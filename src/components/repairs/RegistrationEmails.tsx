"use client";

import { useMemo, useState } from "react";
import {
  addTeamEmails,
  addVendorContact,
  editVendorContact,
  removeTeamEmail,
  removeVendorContact,
  useRegistrationTeam,
  useVendorContacts,
  type VendorContact,
} from "@/lib/db/emailContacts";
import { parseEmails, vendorKey } from "@/lib/registration";
import type { VanRecord } from "@/lib/types";

/**
 * Who the registration reminders go to, typed in by the Repairs login.
 *
 * Two lists. The SWFL team gets every reminder for every van. Each vendor
 * gets the reminders for its own vans, matched by the Vendor column of the
 * vans database. The daily job reads both — see registrationReminders.ts.
 *
 * Folded by default under Add a van: it is set up once and changed rarely,
 * and sixty vans should not be pushed down the page by it every visit. The
 * folded line still says how many addresses there are and which vendors have
 * none, because a vendor with no address is a reminder that never arrives.
 */

const INPUT =
  "min-h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-caution md:text-[14px]";
const PRIMARY =
  "min-h-11 shrink-0 rounded-lg border border-caution-line bg-caution-soft px-4 text-[13px] font-bold text-caution transition-[filter] active:brightness-[0.97] disabled:opacity-45";
const HEADING = "text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint";

export function RegistrationEmails({
  vans,
  uid,
  onError,
}: {
  vans: VanRecord[];
  uid: string;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const team = useRegistrationTeam();
  const vendors = useVendorContacts();

  /** Vendors on a van in the database that have no address to send to. */
  const missing = useMemo(() => {
    const withEmail = new Set(
      vendors.vendors.filter((vendor) => vendor.emails.length > 0).map((vendor) => vendor.key),
    );
    const names = new Map<string, string>();
    for (const van of vans) {
      const key = vendorKey(van.vendor);
      if (key && !withEmail.has(key) && !names.has(key)) names.set(key, van.vendor.trim());
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [vans, vendors.vendors]);

  function run(what: string, write: Promise<unknown>) {
    onError(null);
    write.catch((err: unknown) =>
      onError(err instanceof Error ? `${what}: ${err.message}` : `${what} did not save.`),
    );
  }

  const loading = team.loading || vendors.loading;
  const loadError = team.error ?? vendors.error;

  return (
    <section
      aria-label="Registration emails"
      className="rounded-xl border border-line bg-surface"
    >
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls="registration-emails"
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sunken/40"
      >
        <span className="min-w-0 flex-1">
          <span className={`block ${HEADING}`}>Registration emails</span>
          <span className="mt-0.5 block text-[13px] text-ink-muted">
            {loading
              ? "Loading…"
              : loadError
                ? "Could not load the email lists"
                : `${team.team.length} on the SWFL team · ${vendors.vendors.length} ${
                    vendors.vendors.length === 1 ? "vendor" : "vendors"
                  }`}
            {!loading && missing.length > 0 ? (
              <span className="font-semibold text-caution">
                {" "}
                · {missing.length} {missing.length === 1 ? "vendor has" : "vendors have"} no email
              </span>
            ) : null}
            {!loading && !loadError && team.team.length === 0 ? (
              <span className="font-semibold text-overdue"> · nobody on the team gets reminders</span>
            ) : null}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`size-5 shrink-0 text-ink-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div id="registration-emails" className="space-y-5 border-t border-line px-3 pb-4 pt-3.5">
          {loadError ? (
            <p className="text-[13px] text-overdue">
              Could not read the email lists: {loadError}. If it says permissions, the
              Firestore rules need publishing.
            </p>
          ) : null}

          <TeamList
            team={team.team}
            onAdd={(emails) => run("Adding that address", addTeamEmails(emails, uid))}
            onRemove={(email) => run("Removing that address", removeTeamEmail(email, uid))}
          />

          <VendorList
            vendors={vendors.vendors}
            missing={missing}
            onAdd={(name, emails) => run("Adding that vendor", addVendorContact(name, emails, uid))}
            onEdit={(id, name, emails) =>
              run("That change", editVendorContact(id, name, emails, uid))
            }
            onRemove={(id) => run("Removing that vendor", removeVendorContact(id))}
          />
        </div>
      ) : null}
    </section>
  );
}

/** The SWFL addresses: a chip each, and a box to add more. */
function TeamList({
  team,
  onAdd,
  onRemove,
}: {
  team: string[];
  onAdd: (emails: string[]) => void;
  onRemove: (email: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const parsed = parseEmails(draft);
  const fresh = parsed.emails.filter((email) => !team.includes(email));
  const ready = fresh.length > 0 && parsed.invalid.length === 0;

  return (
    <div>
      <h3 className={HEADING}>SWFL team</h3>
      <p className="mt-0.5 text-[12px] text-ink-faint">
        Every reminder for every van — 7, 5, 3 and 1 day before it expires.
      </p>

      {team.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {team.map((email) => (
            <li
              key={email}
              className="flex min-h-9 items-center gap-1 rounded-lg border border-line bg-sunken/50 pl-2.5 text-[13px] text-ink"
            >
              <span className="break-all">{email}</span>
              <button
                type="button"
                onClick={() => onRemove(email)}
                aria-label={`Remove ${email}`}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:text-overdue"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4">
                  <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2.5 text-[13px] font-semibold text-overdue">
          Nobody yet — add at least one address, or the reminders go only to vendors.
        </p>
      )}

      <form
        className="mt-2.5 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          onAdd(fresh);
          setDraft("");
        }}
      >
        <label htmlFor="team-email" className="sr-only">
          Add a team email
        </label>
        <input
          id="team-email"
          type="text"
          inputMode="email"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="name@example.com"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`${INPUT} md:max-w-sm`}
        />
        <button type="submit" disabled={!ready} className={PRIMARY}>
          Add
        </button>
      </form>
      {parsed.invalid.length > 0 ? (
        <p className="mt-1.5 text-[12px] text-overdue">
          Not an email address: {parsed.invalid.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

/** The vendors: add one, and each one's name and addresses, editable. */
function VendorList({
  vendors,
  missing,
  onAdd,
  onEdit,
  onRemove,
}: {
  vendors: VendorContact[];
  missing: string[];
  onAdd: (name: string, emails: string[]) => void;
  onEdit: (id: string, name: string, emails: string[]) => void;
  onRemove: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  /** A name to start the add form with — from "No email yet". */
  const [prefill, setPrefill] = useState<{ name: string; n: number }>({ name: "", n: 0 });

  function clash(name: string, ignoreId: string | null) {
    const key = vendorKey(name);
    return key ? (vendors.find((vendor) => vendor.key === key && vendor.id !== ignoreId) ?? null) : null;
  }

  return (
    <div>
      <h3 className={HEADING}>Vendors</h3>
      <p className="mt-0.5 text-[12px] text-ink-faint">
        Each vendor gets the reminders for its own vans. The name has to match the
        Vendor column in the vans list.
      </p>

      {missing.length > 0 ? (
        <div className="mt-2.5 rounded-lg border border-caution-line bg-caution-soft/50 px-3 py-2">
          <p className="text-[12px] font-semibold text-caution">No email yet — tap one to add it</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {missing.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setPrefill((was) => ({ name, n: was.n + 1 }));
                  requestAnimationFrame(() => document.getElementById("vendor-add-emails")?.focus());
                }}
                className="min-h-9 rounded-md border border-caution-line bg-surface px-2.5 text-[12px] font-semibold text-ink transition-colors hover:bg-sunken"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-2.5">
        <VendorForm
          key={prefill.n}
          idPrefix="vendor-add"
          initialName={prefill.name}
          initialEmails=""
          submitLabel="Add vendor"
          clash={(name) => clash(name, null)}
          onSubmit={(name, emails) => {
            onAdd(name, emails);
            setPrefill((was) => ({ name: "", n: was.n + 1 }));
          }}
        />
      </div>

      {vendors.length > 0 ? (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {vendors.map((vendor) => (
            <li key={vendor.id}>
              {editingId === vendor.id ? (
                <div className="bg-caution-soft/40 p-3">
                  <VendorForm
                    idPrefix={`vendor-${vendor.id}`}
                    initialName={vendor.name}
                    initialEmails={vendor.emails.join(", ")}
                    submitLabel="Save"
                    clash={(name) => clash(name, vendor.id)}
                    onSubmit={(name, emails) => {
                      setEditingId(null);
                      onEdit(vendor.id, name, emails);
                    }}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => {
                      setEditingId(null);
                      onRemove(vendor.id);
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3 px-3 py-2.5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-center">
                  <div className="min-w-0 flex-1 md:contents">
                    <p className="text-[14px] font-semibold text-ink">{vendor.name}</p>
                    <p className="mt-0.5 break-all text-[13px] text-ink-muted md:mt-0">
                      {vendor.emails.length > 0 ? (
                        vendor.emails.join(", ")
                      ) : (
                        <span className="font-semibold text-caution">No email</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingId(vendor.id)}
                    aria-label={`Edit ${vendor.name}`}
                    className="min-h-9 shrink-0 rounded-lg border border-line px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-sunken active:bg-sunken"
                  >
                    Edit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function VendorForm({
  idPrefix,
  initialName,
  initialEmails,
  submitLabel,
  clash,
  onSubmit,
  onCancel,
  onDelete,
}: {
  idPrefix: string;
  initialName: string;
  initialEmails: string;
  submitLabel: string;
  clash: (name: string) => VendorContact | null;
  onSubmit: (name: string, emails: string[]) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [emails, setEmails] = useState(initialEmails);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const parsed = parseEmails(emails);
  const taken = clash(name);
  const ready =
    name.trim() !== "" && taken === null && parsed.emails.length > 0 && parsed.invalid.length === 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(name, parsed.emails);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onCancel) onCancel();
      }}
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-name`} className="mb-1 block text-[11px] font-semibold text-ink-faint">
            Vendor
          </label>
          <input
            id={`${idPrefix}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Vendor name"
            autoComplete="off"
            spellCheck={false}
            className={INPUT}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-emails`} className="mb-1 block text-[11px] font-semibold text-ink-faint">
            Vendor email
          </label>
          <input
            id={`${idPrefix}-emails`}
            type="text"
            inputMode="email"
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            placeholder="fleet@vendor.com — separate several with commas"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={INPUT}
          />
        </div>
        <div className="flex items-center justify-end gap-1.5">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          ) : null}
          <button type="submit" disabled={!ready} className={`${PRIMARY} flex-1 md:flex-none`}>
            {submitLabel}
          </button>
        </div>
      </div>

      {taken ? (
        <p className="mt-1.5 text-[12px] text-overdue">{taken.name} is already on the list — edit it below.</p>
      ) : parsed.invalid.length > 0 ? (
        <p className="mt-1.5 text-[12px] text-overdue">Not an email address: {parsed.invalid.join(", ")}</p>
      ) : null}

      {onDelete ? (
        <div className="mt-2.5 flex items-center gap-2 border-t border-caution-line/50 pt-2.5">
          {confirmingDelete ? (
            <>
              <span className="text-[12px] text-ink-muted">Remove this vendor&rsquo;s emails?</span>
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
              Remove vendor
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
