"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DocViewer } from "@/components/DocViewer";
import { STATION_TIMEZONE, stationDateKey } from "@/lib/constants";
import {
  registrationBlob,
  setRegistrationActive,
  setRegistrationExpiry,
  uploadRegistration,
} from "@/lib/db/vanRegistration";
import {
  EXPIRING_DAYS,
  REG_ACCEPT,
  activeRegistration,
  driverState,
  regFileProblem,
  uploaderLabel,
} from "@/lib/regDocs";
import { daysLeftPhrase, daysUntil, registrationLabel } from "@/lib/registration";
import type { RegistrationDoc, VanRecord } from "@/lib/types";

/**
 * Van registrations on the vans database: the icon in the table and the
 * modal behind it — upload, replace, deactivate, preview, and the expiry
 * date, all in one place.
 *
 * What is active here is what a driver sees on reg.swfl.app. Files only ever
 * move through /api/vans/registration — see lib/db/vanRegistration.ts.
 */

export function RegIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9.5 13h6M9.5 16.5h4" />
    </svg>
  );
}

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function uploadedOn(doc: RegistrationDoc): string {
  const millis = doc.uploadedAt?.toMillis?.();
  if (!millis) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: STATION_TIMEZONE,
  }).format(new Date(millis));
}

function describe(doc: RegistrationDoc): string {
  const by = uploaderLabel(doc.uploadedBy);
  const on = uploadedOn(doc);
  const kind = doc.contentType === "application/pdf" ? "PDF" : "Photo";
  return [kind, on && `uploaded ${on}`, by && `by ${by}`].filter(Boolean).join(" · ");
}

/** The expiry as a coloured pill: green, amber inside 30 days, red once run out. */
export function ExpiryPill({ expires, today }: { expires: string; today: string }) {
  const state = driverState(expires, today);
  if (state === "none") return <span className="text-[12px] text-ink-faint">No date</span>;
  const left = daysUntil(expires, today);
  const tone =
    state === "expired"
      ? "border-overdue-line bg-overdue-soft text-overdue"
      : state === "soon"
        ? "border-warn-line bg-warn-soft text-warn"
        : "border-arrived-line bg-arrived-soft text-arrived";
  const text = state === "expired" ? "Expired" : state === "soon" ? `Expires ${daysLeftPhrase(left)}` : "Valid";
  return (
    <span className={`inline-flex rounded-md border px-1.5 py-px text-[11px] font-bold ${tone}`}>{text}</span>
  );
}

export function RegistrationModal({
  van,
  canManage,
  onClose,
}: {
  van: VanRecord;
  /** Upload, replace, deactivate and the date: the Repairs login and the dispatcher. */
  canManage: boolean;
  onClose: () => void;
}) {
  const mounted = useMounted();
  const today = stationDateKey();
  const current = activeRegistration(van.registrationDocs);
  const earlier = van.registrationDocs.filter((doc) => doc.id !== current?.id).reverse();
  const expired = driverState(van.registrationExpires, today) === "expired";

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<RegistrationDoc | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [expires, setExpires] = useState(van.registrationExpires);
  const dateChanged = expires !== van.registrationExpires;

  const closePreview = useCallback(() => setPreviewing(null), []);

  // Esc closes — unless the preview is open over this, which takes Esc itself.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !previewing && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [mounted, onClose, previewing, busy]);

  async function run(label: string, work: () => Promise<void>) {
    setError(null);
    setBusy(label);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function take(files: File[]) {
    const file = files[0];
    if (!file) return;
    const problem = regFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setConfirmOff(false);
    void run(current ? "Replacing…" : "Uploading…", () => uploadRegistration(van.id, file));
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40">
        <button
          type="button"
          aria-label="Close"
          onClick={() => !busy && onClose()}
          className="absolute inset-0 bg-ink/45"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reg-modal-title"
          className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-safe sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[480px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
        >
          <div className="mx-auto w-full max-w-lg space-y-5 px-4 pb-5 pt-2.5 sm:pt-4">
            <span aria-hidden="true" className="mx-auto block h-1 w-10 rounded-full bg-line-strong sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="reg-modal-title" className="tnum font-mono text-[22px] font-bold leading-tight tracking-tight">
                  {van.van}
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {van.vendor ? `${van.vendor} · ` : ""}Registration
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={!!busy}
                aria-label="Close"
                className="-mr-1.5 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken active:bg-sunken disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* Expiry */}
            <section aria-labelledby="reg-expiry-label">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  id="reg-expiry-label"
                  htmlFor="reg-expiry"
                  className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
                >
                  Expires
                </label>
                <ExpiryPill expires={van.registrationExpires} today={today} />
              </div>
              {canManage ? (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (dateChanged) void run("Saving the date…", () => setRegistrationExpiry(van.id, expires));
                  }}
                >
                  <input
                    id="reg-expiry"
                    type="date"
                    value={expires}
                    onChange={(event) => setExpires(event.target.value)}
                    className="tnum min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[16px] text-ink outline-none focus:border-caution sm:text-[14px]"
                  />
                  <button
                    type="submit"
                    disabled={!dateChanged || !!busy}
                    className="min-h-11 rounded-lg border border-caution-line bg-caution-soft px-4 text-[13px] font-bold text-caution disabled:opacity-45"
                  >
                    Save date
                  </button>
                </form>
              ) : (
                <p className="tnum text-[15px] text-ink">
                  {van.registrationExpires ? registrationLabel(van.registrationExpires) : "—"}
                </p>
              )}
              <p className="mt-1.5 text-[12px] text-ink-faint">
                Drives the reminder emails. Drivers see amber inside {EXPIRING_DAYS} days and an EXPIRED banner after.
              </p>
            </section>

            {/* What drivers see */}
            <section aria-labelledby="reg-current-label">
              <h3 id="reg-current-label" className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Shown to drivers
              </h3>
              {current ? (
                <div className="rounded-lg border border-line bg-sunken/40 p-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink">
                      <RegIcon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-ink">{current.fileName || "Uploaded file"}</p>
                      <p className="text-[12px] text-ink-muted">{describe(current)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewing(current)}
                      className="min-h-9 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-semibold text-ink hover:bg-sunken"
                    >
                      Preview
                    </button>
                    {canManage ? (
                      confirmOff ? (
                        <>
                          <span className="ml-1 text-[12px] text-ink-muted">Stop showing it to drivers?</span>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() =>
                              void run("Deactivating…", () => setRegistrationActive(van.id, current.id, false)).then(() =>
                                setConfirmOff(false),
                              )
                            }
                            className="min-h-9 rounded-md border border-overdue-line bg-overdue-soft px-2.5 text-[12px] font-bold text-overdue"
                          >
                            Deactivate
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmOff(false)}
                            className="min-h-9 rounded-md px-2 text-[12px] font-semibold text-ink-faint hover:text-ink"
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmOff(true)}
                          disabled={!!busy}
                          className="min-h-9 rounded-md px-2 text-[12px] font-semibold text-overdue hover:underline"
                        >
                          Deactivate
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-[13px] text-ink-muted">
                  Nothing on file. A driver searching {van.van} sees &ldquo;No registration on file&rdquo;.
                </p>
              )}
            </section>

            {canManage ? (
              <UploadZone busy={busy} replacing={!!current} onFiles={take} />
            ) : null}

            {error ? (
              <p role="alert" className="text-[13px] text-overdue">
                {error}
              </p>
            ) : null}

            {earlier.length > 0 ? (
              <section aria-labelledby="reg-earlier-label">
                <h3 id="reg-earlier-label" className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Earlier versions · {earlier.length}
                </h3>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {earlier.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink-muted">{doc.fileName || "Uploaded file"}</p>
                        <p className="text-[11px] text-ink-faint">{describe(doc)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewing(doc)}
                          className="min-h-9 rounded-md px-2 text-[12px] font-semibold text-ink-muted hover:bg-sunken hover:text-ink"
                        >
                          Preview
                        </button>
                        {canManage ? (
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => void run("Restoring…", () => setRegistrationActive(van.id, doc.id, true))}
                            className="min-h-9 rounded-md px-2 text-[12px] font-semibold text-ink-muted hover:bg-sunken hover:text-ink disabled:opacity-45"
                          >
                            Make current
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {previewing ? (
        <DocViewer
          key={previewing.id}
          label={`Registration for ${van.van}`}
          expiredOn={expired ? registrationLabel(van.registrationExpires) : null}
          load={() => registrationBlob(van.id, previewing.id)}
          onClose={closePreview}
        />
      ) : null}
    </>,
    document.body,
  );
}

/** Drop, click or paste a file. While one is going up, it says so and takes nothing else. */
function UploadZone({
  busy,
  replacing,
  onFiles,
}: {
  busy: string | null;
  replacing: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // A pasted file lands here too — a screenshot of the registration, say.
  const latest = useRef({ busy, onFiles });
  useEffect(() => {
    latest.current = { busy, onFiles };
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0 || latest.current.busy) return;
      event.preventDefault();
      latest.current.onFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (busy) return;
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (busy) return;
        onFiles(Array.from(event.dataTransfer.files).slice(0, 1));
      }}
      className={`rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
        over ? "border-caution bg-caution-soft/50" : "border-line-strong bg-sunken/40"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept={REG_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          onFiles(files);
        }}
      />
      {busy ? (
        <p role="status" className="flex items-center justify-center gap-2 text-[13px] font-semibold text-ink-muted">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-caution motion-reduce:animate-none"
          />
          {busy}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="min-h-10 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-sunken"
          >
            {replacing ? "Replace with a new file" : "Upload registration"}
          </button>
          <p className="text-[12px] leading-snug text-ink-faint">
            or drop / paste it here · PDF, JPG, PNG, WebP or HEIC, up to 10 MB
            {replacing ? " · the current one is kept under Earlier versions" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
