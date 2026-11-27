"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { shareOrSave } from "@/lib/api";
import { uploadVanQr, vanQrBlob, vanQrUrl } from "@/lib/db/vanQr";
import {
  canCopyImage,
  dataUrlBlob,
  decodeQr,
  qrDataUrl,
  shrinkForUpload,
  toPng,
} from "@/lib/qrImage";
import { QR_ACCEPT, qrDownloadName, qrFileProblem, vanKeyOfFilename } from "@/lib/vanQr";
import type { VanRecord } from "@/lib/types";
import { lockScroll } from "@/lib/scrollLock";

/**
 * Van QR codes on the vans database: the icon in the table, the field in the
 * edit form, the viewer and the bulk upload.
 *
 * The image itself only ever comes from /api/vans/qr — see lib/db/vanQr.ts.
 * When the QR could be read on upload, its text is kept, and the viewer draws
 * a fresh, crisp code from that rather than showing a phone photo of one.
 */

/* ------------------------------------------------------------------------ */
/* Shared bits                                                              */
/* ------------------------------------------------------------------------ */

export function QrIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5v2M18.5 14h2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
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

/** Esc closes and the page behind stops scrolling — the same as every sheet in the app. */
function useSheetChrome(onClose: () => void, closable = true) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closable) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const unlockScroll = lockScroll();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlockScroll();
    };
  }, [onClose, closable]);
}

/** Which version of a van's QR this is, so a replaced image is never served from a stale URL. */
function qrVersion(van: Pick<VanRecord, "id" | "qrUpdatedAt">) {
  return `${van.id}:${van.qrUpdatedAt?.toMillis?.() ?? 0}`;
}

/**
 * The uploaded image's short-lived URL, or where it has got to.
 *
 * Keyed by the image's version and held with that key, so a replaced QR reads
 * as loading again rather than showing the old one for a moment.
 */
function useUploadedUrl(van: VanRecord, enabled: boolean) {
  const key = qrVersion(van);
  const [held, setHeld] = useState<{ key: string; url?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!enabled || !van.qrPath) return;
    let live = true;
    vanQrUrl(van).then(
      (url) => live && setHeld({ key, url }),
      (error: unknown) =>
        live &&
        setHeld({
          key,
          error: error instanceof Error ? error.message : "The image could not be loaded.",
        }),
    );
    return () => {
      live = false;
    };
    // `key` covers the van and its version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, van.qrPath]);

  return held?.key === key ? held : null;
}

/* ------------------------------------------------------------------------ */
/* Picking an image: file, drop or paste                                    */
/* ------------------------------------------------------------------------ */

/** The image files in a drop or a paste, in order. */
function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/") || file.type === "");
}

/** A drop target that also takes a click; `onFiles` gets whatever arrived. */
function DropZone({
  multiple = false,
  onFiles,
  buttonRef,
  compact = false,
  children,
}: {
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={`rounded-lg border-2 border-dashed transition-colors ${
        over ? "border-caution bg-caution-soft/50" : "border-line-strong bg-sunken/40"
      } ${compact ? "px-3 py-3" : "px-4 py-6"}`}
    >
      <input
        ref={input}
        type="file"
        accept={QR_ACCEPT}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <div className={`flex ${compact ? "flex-wrap items-center gap-x-3 gap-y-2" : "flex-col items-center gap-2 text-center"}`}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => input.current?.click()}
          className="min-h-10 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-sunken"
        >
          {multiple ? "Choose files" : "Choose file"}
        </button>
        <p className="text-[12px] leading-snug text-ink-faint">{children}</p>
      </div>
    </div>
  );
}

/**
 * Images pasted while `active` says this is where a paste belongs.
 *
 * Only a paste that carries an image is taken — pasting a VIN into the box
 * beside this still pastes the VIN.
 */
function usePastedImages(active: () => boolean, onFiles: (files: File[]) => void) {
  const latest = useRef({ active, onFiles });
  useEffect(() => {
    latest.current = { active, onFiles };
  });

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFiles(event.clipboardData?.files);
      if (files.length === 0 || !latest.current.active()) return;
      event.preventDefault();
      latest.current.onFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
}

/* ------------------------------------------------------------------------ */
/* The QR field in the edit form                                            */
/* ------------------------------------------------------------------------ */

/** What Save will do to the van's QR. */
export type QrDraft =
  | { kind: "keep" }
  | { kind: "remove" }
  | {
      kind: "new";
      file: Blob;
      /** An object URL for the preview, and the draft's identity. */
      preview: string;
      qrText: string | null;
      decoding: boolean;
    };

export const KEEP_QR: QrDraft = { kind: "keep" };

/** The draft is still being read, and Save should wait the second it takes. */
export function qrDraftBusy(draft: QrDraft) {
  return draft.kind === "new" && draft.decoding;
}

export function QrField({
  van,
  draft,
  setDraft,
  autoFocus = false,
}: {
  van: VanRecord;
  draft: QrDraft;
  setDraft: Dispatch<SetStateAction<QrDraft>>;
  autoFocus?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const firstButton = useRef<HTMLButtonElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    box.current?.scrollIntoView({ block: "nearest" });
    firstButton.current?.focus();
  }, [autoFocus]);

  const preview = draft.kind === "new" ? draft.preview : null;
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const take = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const wrong = qrFileProblem(file);
      setProblem(wrong);
      if (wrong) return;

      const url = URL.createObjectURL(file);
      setDraft({ kind: "new", file, preview: url, qrText: null, decoding: true });
      decodeQr(file).then((qrText) =>
        setDraft((was) =>
          was.kind === "new" && was.preview === url ? { ...was, qrText, decoding: false } : was,
        ),
      );
    },
    [setDraft],
  );

  // A paste belongs here when focus is somewhere in this form, or nowhere —
  // unless a sheet is open over the page, which then takes it.
  usePastedImages(() => {
    const form = box.current?.closest("form");
    const focused = document.activeElement;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
    return !!form && (focused === document.body || form.contains(focused));
  }, take);

  const uploaded = useUploadedUrl(van, draft.kind === "keep" && !!van.qrPath);
  const showing =
    draft.kind === "new"
      ? { src: draft.preview, text: draft.qrText, decoding: draft.decoding }
      : draft.kind === "keep" && van.qrPath
        ? { src: uploaded?.url ?? null, text: van.qrText, decoding: false }
        : null;

  return (
    <div ref={box} className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        QR code
      </p>

      {showing ? (
        <div className="flex items-start gap-3">
          <div className="grid size-[88px] shrink-0 place-items-center rounded-lg border border-line bg-white p-1.5">
            {showing.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- a blob or signed URL, not a static asset
              <img src={showing.src} alt={`QR for ${van.van}`} className="max-h-full max-w-full object-contain" />
            ) : uploaded?.error ? (
              <span className="px-1 text-center text-[10px] text-overdue">Could not load</span>
            ) : (
              <span className="size-full animate-pulse rounded bg-sunken" aria-label="Loading the QR" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            {showing.decoding ? (
              <p className="text-[12px] text-ink-muted">Reading the QR…</p>
            ) : showing.text ? (
              <p className="text-[12px] text-ink-muted">
                <span className="font-semibold text-arrived">Reads </span>
                <span className="break-all font-mono text-ink">{truncate(showing.text, 90)}</span>
              </p>
            ) : draft.kind === "new" ? (
              <p className="rounded-md border border-warn-line bg-warn-soft px-2.5 py-1.5 text-[12px] leading-snug text-warn">
                Couldn&apos;t read a QR in this image, save anyway?
              </p>
            ) : (
              <p className="text-[12px] text-ink-faint">Uploaded image — no QR text was read from it.</p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <ReplaceButton buttonRef={firstButton} onFiles={take} />
              {draft.kind === "new" ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(KEEP_QR);
                    setProblem(null);
                  }}
                  className="min-h-9 rounded-md px-2 text-[12px] font-semibold text-ink-faint hover:text-ink"
                >
                  {van.qrPath ? "Keep the old one" : "Clear"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setDraft({ kind: "remove" })}
                  className="min-h-9 rounded-md px-2 text-[12px] font-semibold text-overdue hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            {draft.kind === "new" ? (
              <p className="text-[11px] text-ink-faint">Saved when you press Save.</p>
            ) : null}
          </div>
        </div>
      ) : draft.kind === "remove" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-overdue-line bg-overdue-soft/60 px-3 py-2.5 text-[12px]">
          <span className="text-overdue">The QR will be deleted when you press Save.</span>
          <button
            ref={firstButton}
            type="button"
            onClick={() => setDraft(KEEP_QR)}
            className="min-h-9 rounded-md px-2 font-semibold text-ink-muted hover:text-ink"
          >
            Undo
          </button>
        </div>
      ) : (
        <DropZone onFiles={take} buttonRef={firstButton} compact>
          or drop / paste an image here · PNG, JPG or WebP, up to 5 MB
        </DropZone>
      )}

      {problem ? <p className="mt-1.5 text-[12px] text-overdue">{problem}</p> : null}
    </div>
  );
}

function ReplaceButton({
  onFiles,
  buttonRef,
}: {
  onFiles: (files: File[]) => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={QR_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          onFiles(files);
        }}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={() => input.current?.click()}
        className="min-h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[12px] font-semibold text-ink hover:bg-sunken"
      >
        Replace
      </button>
    </>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* ------------------------------------------------------------------------ */
/* The viewer                                                               */
/* ------------------------------------------------------------------------ */

export function QrModal({ van, onClose }: { van: VanRecord; onClose: () => void }) {
  const mounted = useMounted();
  useSheetChrome(onClose);

  // A crisp code drawn from the text, when there is text and it fits in a QR.
  const [drawnQr, setDrawnQr] = useState<{ text: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!van.qrText) return;
    const text = van.qrText;
    let live = true;
    qrDataUrl(text).then((url) => live && setDrawnQr({ text, url }));
    return () => {
      live = false;
    };
  }, [van.qrText]);
  const generated = van.qrText && drawnQr?.text === van.qrText ? drawnQr.url : null;
  const generating = !!van.qrText && drawnQr?.text !== van.qrText;

  const [wantOriginal, setWantOriginal] = useState(false);
  const showOriginal = wantOriginal || (!generated && !generating);
  const uploaded = useUploadedUrl(van, showOriginal);

  const src = showOriginal ? (uploaded?.url ?? null) : generated;
  const sourceKey = showOriginal ? `original:${qrVersion(van)}` : `drawn:${van.qrText}`;

  /**
   * The PNG behind Download and Copy, started as soon as the image is chosen
   * so a tap spends nothing on the network — the iPhone share sheet will not
   * open off a tap that waited for one. See shareOrSave.
   */
  const pngs = useRef(new Map<string, Promise<Blob>>());
  const pngFor = useCallback(
    (key: string): Promise<Blob> | null => {
      const held = pngs.current.get(key);
      if (held) return held;
      let made: Promise<Blob>;
      if (key.startsWith("drawn:")) {
        if (!generated) return null;
        made = Promise.resolve(dataUrlBlob(generated));
      } else {
        made = vanQrBlob(van.id).then(toPng);
      }
      pngs.current.set(key, made);
      made.catch(() => pngs.current.delete(key));
      return made;
    },
    [generated, van.id],
  );
  useEffect(() => {
    if (src) pngFor(sourceKey)?.catch(() => {});
  }, [src, sourceKey, pngFor]);

  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [copyable] = useState(canCopyImage);

  async function download() {
    setNote(null);
    try {
      const png = await pngFor(sourceKey);
      if (!png) return;
      const handed = await shareOrSave(png, qrDownloadName(van.van), `${van.van} QR`);
      if (handed.how === "failed") setNote({ tone: "bad", text: "That did not open. Tap Download again." });
    } catch (error) {
      setNote({ tone: "bad", text: error instanceof Error ? error.message : "Could not download it." });
    }
  }

  async function copy() {
    setNote(null);
    const png = pngFor(sourceKey);
    if (!png) return;
    try {
      // The promise itself, not its result: Safari wants the ClipboardItem made inside the tap.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setNote({ tone: "ok", text: "Copied." });
    } catch {
      setNote({ tone: "bad", text: "This browser would not copy the image." });
    }
  }

  function print() {
    window.print();
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 print:hidden">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-ink/45"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
          className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-safe sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
        >
          <div className="mx-auto w-full max-w-lg px-4 pb-5 pt-2.5 sm:pt-4">
            <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="qr-modal-title" className="tnum font-mono text-[22px] font-bold leading-tight tracking-tight">
                  {van.van}
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {van.vendor ? `${van.vendor} · ` : ""}QR code
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1.5 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken active:bg-sunken"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-4 grid aspect-square w-full place-items-center rounded-xl border border-line bg-white p-6">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data or signed URL
                <img
                  src={src}
                  alt={`QR code for ${van.van}`}
                  className="max-h-full max-w-full object-contain"
                  style={showOriginal ? undefined : { imageRendering: "pixelated" }}
                />
              ) : showOriginal && uploaded?.error ? (
                <p className="px-4 text-center text-[13px] text-overdue">{uploaded.error}</p>
              ) : (
                <span className="size-3/4 animate-pulse rounded-lg bg-sunken" aria-label="Loading the QR" />
              )}
            </div>

            {van.qrText ? (
              <p className="mt-2 break-all text-center font-mono text-[11px] leading-snug text-ink-faint">
                {truncate(van.qrText, 140)}
              </p>
            ) : null}

            {generated ? (
              <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-[12px] font-semibold text-ink-muted">
                <input
                  type="checkbox"
                  checked={wantOriginal}
                  onChange={(event) => setWantOriginal(event.target.checked)}
                  className="size-4 accent-[var(--color-caution)]"
                />
                Show original upload
              </label>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={download} disabled={!src} className="flex-1">
                Download PNG
              </Button>
              <Button variant="secondary" onClick={print} disabled={!src}>
                Print
              </Button>
              {copyable ? (
                <Button variant="secondary" onClick={copy} disabled={!src}>
                  Copy image
                </Button>
              ) : null}
            </div>

            {note ? (
              <p
                role="status"
                className={`mt-2 text-[12px] ${note.tone === "ok" ? "text-arrived" : "text-overdue"}`}
              >
                {note.text}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* What Print prints: the van and its code, nothing else. See .qr-print in globals.css. */}
      {src ? (
        <div className="qr-print" aria-hidden="true">
          <p className="qr-print-van">{van.van}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="qr-print-img" data-drawn={showOriginal ? undefined : ""} />
        </div>
      ) : null}
    </>,
    document.body,
  );
}

/* ------------------------------------------------------------------------ */
/* Bulk upload                                                              */
/* ------------------------------------------------------------------------ */

type BulkRow = {
  id: string;
  file: File;
  preview: string;
  problem: string | null;
  van: VanRecord | null;
  /** Another file above this one is already for the same van. */
  duplicateOf: string | null;
  decoding: boolean;
  qrText: string | null;
  overwrite: boolean;
  state: "waiting" | "uploading" | "done" | "failed";
  error?: string;
};

/** Whether a row will be uploaded when Upload is pressed. */
function willUpload(row: BulkRow) {
  return (
    !row.problem &&
    !!row.van &&
    !row.duplicateOf &&
    (!row.van.qrPath || row.overwrite) &&
    row.state !== "done"
  );
}

export function BulkQrButton({
  vans,
  onError,
  className = "",
}: {
  vans: VanRecord[];
  onError: (message: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink ${className}`}
      >
        <QrIcon className="size-4" />
        Bulk upload QRs
      </button>
      {open ? <BulkQrSheet vans={vans} onError={onError} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function BulkQrSheet({
  vans,
  onError,
  onClose,
}: {
  vans: VanRecord[];
  onError: (message: string | null) => void;
  onClose: () => void;
}) {
  const mounted = useMounted();
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  useSheetChrome(onClose, !running);

  const byKey = useMemo(() => {
    const map = new Map<string, VanRecord>();
    for (const van of vans) if (van.key && !map.has(van.key)) map.set(van.key, van);
    return map;
  }, [vans]);

  // Every preview URL made here is let go when the sheet closes.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    const made = previews.current;
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const add = useCallback(
    (files: File[]) => {
      if (running) return;
      setFinished(false);
      const fresh: BulkRow[] = files.map((file) => {
        const preview = URL.createObjectURL(file);
        previews.current.push(preview);
        const problem = qrFileProblem(file);
        return {
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          file,
          preview,
          problem,
          van: byKey.get(vanKeyOfFilename(file.name)) ?? null,
          duplicateOf: null,
          decoding: !problem,
          qrText: null,
          overwrite: false,
          state: "waiting",
        };
      });
      setRows((was) => markDuplicates([...was, ...fresh]));

      for (const row of fresh) {
        if (row.problem) continue;
        decodeQr(row.file).then((qrText) =>
          setRows((was) =>
            was.map((each) => (each.id === row.id ? { ...each, qrText, decoding: false } : each)),
          ),
        );
      }
    },
    [byKey, running],
  );

  usePastedImages(() => true, add);

  const queued = rows.filter(willUpload);
  const decoding = rows.some((row) => row.decoding);
  const done = rows.filter((row) => row.state === "done").length;
  const failed = rows.filter((row) => row.state === "failed").length;
  const [progress, setProgress] = useState({ at: 0, of: 0 });

  async function upload() {
    const batch = rows.filter(willUpload);
    if (batch.length === 0) return;
    onError(null);
    setRunning(true);
    setProgress({ at: 0, of: batch.length });

    const patch = (id: string, change: Partial<BulkRow>) =>
      setRows((was) => was.map((row) => (row.id === id ? { ...row, ...change } : row)));

    // One at a time: a station's worth of QRs is a minute at most, and a phone
    // on yard signal does better with one upload than with twenty at once.
    for (const [index, row] of batch.entries()) {
      patch(row.id, { state: "uploading", error: undefined });
      try {
        const image = await shrinkForUpload(row.file);
        await uploadVanQr(row.van!.id, image, row.qrText);
        patch(row.id, { state: "done" });
      } catch (error) {
        patch(row.id, {
          state: "failed",
          error: error instanceof Error ? error.message : "Did not upload.",
        });
      }
      setProgress({ at: index + 1, of: batch.length });
    }

    setRunning(false);
    setFinished(true);
  }

  if (!mounted) return null;

  const percent = progress.of ? Math.round((progress.at / progress.of) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        onClick={running ? undefined : onClose}
        className="absolute inset-0 bg-ink/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-qr-title"
        className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-line bg-surface pb-safe sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:w-[640px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <div className="px-4 pt-2.5 sm:pt-4">
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="bulk-qr-title" className="text-[20px] font-bold leading-tight tracking-tight">
                Bulk upload QRs
              </h2>
              <p className="mt-1 text-[13px] leading-snug text-ink-muted">
                Name each file after its van — <span className="font-mono">BR03.png</span>,{" "}
                <span className="font-mono">br.03.jpg</span> and{" "}
                <span className="font-mono">BR.03 (XL).png</span> all go to BR.03.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              aria-label="Close"
              className="-mr-1.5 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken disabled:opacity-40"
            >
              <CloseIcon />
            </button>
          </div>

          {!running ? (
            <div className="mt-3">
              <DropZone multiple onFiles={add} compact={rows.length > 0}>
                {rows.length > 0 ? "Add more — drop or paste" : "or drop / paste images here · PNG, JPG or WebP, up to 5 MB each"}
              </DropZone>
            </div>
          ) : null}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-y border-line">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-faint">No files yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <BulkRowView
                  key={row.id}
                  row={row}
                  locked={running}
                  onOverwrite={(overwrite) =>
                    setRows((was) => was.map((each) => (each.id === row.id ? { ...each, overwrite } : each)))
                  }
                  onDrop={() => setRows((was) => markDuplicates(was.filter((each) => each.id !== row.id)))}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2.5 px-4 py-3">
          {running || finished ? (
            <div>
              <div className="flex justify-between text-[12px] font-semibold text-ink-muted">
                <span>{running ? "Uploading…" : "Finished"}</span>
                <span className="tnum font-mono">
                  {progress.at} / {progress.of}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.of}
                aria-valuenow={progress.at}
                aria-label="Upload progress"
                className="mt-1 h-2 overflow-hidden rounded-full bg-sunken"
              >
                <div
                  className="h-full rounded-full bg-arrived transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          ) : null}

          {finished && failed > 0 ? (
            <ErrorNote>
              {failed === 1 ? "1 file did not upload." : `${failed} files did not upload.`} Press Upload to try{" "}
              {failed === 1 ? "it" : "them"} again.
            </ErrorNote>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-ink-faint">
              {decoding
                ? "Reading the QRs…"
                : finished
                  ? `${done} uploaded`
                  : `${queued.length} to upload`}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={running}>
                {finished ? "Done" : "Cancel"}
              </Button>
              <Button
                variant="primary"
                onClick={upload}
                disabled={running || decoding || queued.length === 0}
                loading={running}
              >
                {queued.length > 0 ? `Upload ${queued.length}` : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A second file for a van already in the list waits behind the first. */
function markDuplicates(rows: BulkRow[]): BulkRow[] {
  const claimed = new Map<string, string>();
  return rows.map((row) => {
    if (!row.van || row.problem) return { ...row, duplicateOf: null };
    const first = claimed.get(row.van.id);
    if (first) return { ...row, duplicateOf: first };
    claimed.set(row.van.id, row.file.name);
    return { ...row, duplicateOf: null };
  });
}

function BulkRowView({
  row,
  locked,
  onOverwrite,
  onDrop,
}: {
  row: BulkRow;
  locked: boolean;
  onOverwrite: (overwrite: boolean) => void;
  onDrop: () => void;
}) {
  const status = (() => {
    if (row.state === "done") return { tone: "ok", text: "Uploaded" };
    if (row.state === "uploading") return { tone: "muted", text: "Uploading…" };
    if (row.state === "failed") return { tone: "bad", text: row.error ?? "Did not upload" };
    if (row.problem) return { tone: "bad", text: row.problem };
    if (!row.van) return { tone: "muted", text: "No match" };
    if (row.duplicateOf) return { tone: "muted", text: `Same van as ${row.duplicateOf} — skipped` };
    if (row.van.qrPath) return { tone: "warn", text: "Already has QR" };
    return { tone: "ok", text: "Matched" };
  })();
  const tones: Record<string, string> = {
    ok: "border-arrived-line bg-arrived-soft text-arrived",
    bad: "border-overdue-line bg-overdue-soft text-overdue",
    warn: "border-warn-line bg-warn-soft text-warn",
    muted: "border-line bg-sunken text-ink-muted",
  };

  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 ${willUpload(row) || row.state !== "waiting" ? "" : "opacity-75"}`}>
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-white p-0.5">
        {!row.problem ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob URL
          <img src={row.preview} alt="" className="max-h-full max-w-full object-contain" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-ink" title={row.file.name}>
          {row.file.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="text-ink-faint">→</span>
          <span className={`tnum font-mono font-bold ${row.van ? "text-ink" : "text-ink-faint"}`}>
            {row.van?.van ?? "—"}
          </span>
          <span className={`max-w-full truncate rounded-md border px-1.5 py-px text-[11px] font-bold ${tones[status.tone]}`}>
            {status.text}
          </span>
          {!row.problem && row.van ? (
            row.decoding ? (
              <span className="text-ink-faint">reading…</span>
            ) : row.qrText ? (
              <span className="text-ink-faint">QR read</span>
            ) : (
              <span className="text-warn">no QR found — saves anyway</span>
            )
          ) : null}
        </div>
      </div>

      {row.van && row.van.qrPath && !row.problem && !row.duplicateOf && row.state === "waiting" ? (
        <div role="group" aria-label={`${row.van.van} already has a QR`} className="flex shrink-0 rounded-lg border border-line-strong p-0.5 text-[12px] font-semibold">
          {(
            [
              [false, "Skip"],
              [true, "Overwrite"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              disabled={locked}
              aria-pressed={row.overwrite === value}
              onClick={() => onOverwrite(value)}
              className={`min-h-8 rounded-md px-2.5 transition-colors ${
                row.overwrite === value
                  ? value
                    ? "bg-caution-soft text-caution"
                    : "bg-sunken text-ink"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {!locked && row.state !== "done" ? (
        <button
          type="button"
          onClick={onDrop}
          aria-label={`Take ${row.file.name} off the list`}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken hover:text-ink"
        >
          <CloseIcon />
        </button>
      ) : null}
    </li>
  );
}
