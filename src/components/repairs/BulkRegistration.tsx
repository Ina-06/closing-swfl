"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { RegIcon } from "@/components/repairs/VanRegistration";
import { uploadRegistration } from "@/lib/db/vanRegistration";
import { REG_ACCEPT, activeRegistration, guessKind, regFileProblem } from "@/lib/regDocs";
import { vanKey } from "@/lib/vans";
import type { VanRecord } from "@/lib/types";
import { lockScroll } from "@/lib/scrollLock";

/**
 * Bulk upload registrations — the vans database's twin of Bulk upload QRs.
 *
 * Drop a folder's worth of files. Each one is matched to a van by its name
 * ("RT56.pdf", "RT.56 registration.pdf", "rt-56-reg.jpg"), or failing that by
 * a VIN anywhere in the name — registrations often come back from the vendor
 * named by VIN. Anything still unmatched gets a van picker. Then one upload
 * at a time, through the same route as the single upload, so each file
 * becomes that van's active registration and the previous one is kept.
 */

type Row = {
  id: string;
  file: File;
  problem: string | null;
  van: VanRecord | null;
  /** How the van was found, so a wrong guess is easy to spot. */
  matchedBy: "name" | "vin" | "picked" | null;
  duplicateOf: string | null;
  replace: boolean;
  state: "waiting" | "uploading" | "done" | "failed";
  error?: string;
};

/** "RT.56 registration.pdf", "rt-56-reg.jpg", "RT56_Reg (2).pdf" → RT56. */
export function vanKeyOfRegFilename(name: string): string {
  const stem = name
    .replace(/\.[A-Za-z0-9]{2,5}$/, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/[\s._-]*(?:vehicle[\s._-]*)?reg(?:istration)?(?:[\s._-]*(?:card|doc|form))?$/i, "")
    .replace(/^(?:reg(?:istration)?)[\s._-]+/i, "")
    .replace(/_+/g, " ")
    .trim();
  return vanKey(stem);
}

function willUpload(row: Row) {
  return (
    !row.problem &&
    !!row.van &&
    !row.duplicateOf &&
    (!activeRegistration(row.van.registrationDocs) || row.replace) &&
    row.state !== "done"
  );
}

function markDuplicates(rows: Row[]): Row[] {
  const claimed = new Map<string, string>();
  return rows.map((row) => {
    if (!row.van || row.problem) return { ...row, duplicateOf: null };
    const first = claimed.get(row.van.id);
    if (first) return { ...row, duplicateOf: first };
    claimed.set(row.van.id, row.file.name);
    return { ...row, duplicateOf: null };
  });
}

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function BulkRegButton({ vans, onError }: { vans: VanRecord[]; onError: (message: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        <RegIcon className="size-4" />
        Bulk upload registrations
      </button>
      {open ? <BulkRegSheet vans={vans} onError={onError} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function BulkRegSheet({
  vans,
  onError,
  onClose,
}: {
  vans: VanRecord[];
  onError: (message: string | null) => void;
  onClose: () => void;
}) {
  const mounted = useMounted();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState({ at: 0, of: 0 });
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // Esc closes and the page behind holds still — unless an upload is going.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    const unlockScroll = lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [mounted, onClose, running]);

  const byKey = useMemo(() => {
    const map = new Map<string, VanRecord>();
    for (const van of vans) if (van.key && !map.has(van.key)) map.set(van.key, van);
    return map;
  }, [vans]);

  const sorted = useMemo(
    () => [...vans].sort((a, b) => a.van.localeCompare(b.van, undefined, { numeric: true, sensitivity: "base" })),
    [vans],
  );

  const match = useCallback(
    (name: string): Pick<Row, "van" | "matchedBy"> => {
      const byName = byKey.get(vanKeyOfRegFilename(name));
      if (byName) return { van: byName, matchedBy: "name" };
      const upper = name.toUpperCase();
      const byVin = vans.filter((van) => van.vin.length >= 11 && upper.includes(van.vin));
      if (byVin.length === 1) return { van: byVin[0], matchedBy: "vin" };
      return { van: null, matchedBy: null };
    },
    [byKey, vans],
  );

  const add = useCallback(
    (files: File[]) => {
      if (running || files.length === 0) return;
      setFinished(false);
      const fresh: Row[] = files.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        problem: regFileProblem(file),
        ...match(file.name),
        duplicateOf: null,
        replace: false,
        state: "waiting",
      }));
      setRows((was) => markDuplicates([...was, ...fresh]));
    },
    [match, running],
  );

  // Pasting files in works here too.
  const latest = useRef(add);
  useEffect(() => {
    latest.current = add;
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      latest.current(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const patch = (id: string, change: Partial<Row>) =>
    setRows((was) => was.map((row) => (row.id === id ? { ...row, ...change } : row)));

  const queued = rows.filter(willUpload);
  const unmatched = rows.filter((row) => !row.problem && !row.van).length;
  const done = rows.filter((row) => row.state === "done").length;
  const failed = rows.filter((row) => row.state === "failed").length;

  async function upload() {
    const batch = rows.filter(willUpload);
    if (batch.length === 0) return;
    onError(null);
    setRunning(true);
    setProgress({ at: 0, of: batch.length });

    // One at a time: kinder to a phone on yard signal, and each one is a few seconds at most.
    for (const [index, row] of batch.entries()) {
      patch(row.id, { state: "uploading", error: undefined });
      try {
        await uploadRegistration(row.van!.id, row.file);
        patch(row.id, { state: "done" });
      } catch (error) {
        patch(row.id, { state: "failed", error: error instanceof Error ? error.message : "Did not upload." });
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
      <button type="button" aria-label="Close" onClick={running ? undefined : onClose} className="absolute inset-0 bg-ink/45" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-reg-title"
        className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-line bg-surface pb-safe sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:w-[680px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <div className="px-4 pt-2.5 sm:pt-4">
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="bulk-reg-title" className="text-[20px] font-bold leading-tight tracking-tight">
                Bulk upload registrations
              </h2>
              <p className="mt-1 text-[13px] leading-snug text-ink-muted">
                Name each file after its van — <span className="font-mono">RT56.pdf</span> or{" "}
                <span className="font-mono">RT.56 registration.pdf</span> — or include its VIN. Anything that
                doesn&apos;t match gets a van picker.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              aria-label="Close"
              className="-mr-1.5 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {!running ? (
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
                add(Array.from(event.dataTransfer.files));
              }}
              className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-2 border-dashed transition-colors ${
                rows.length > 0 ? "px-3 py-3" : "flex-col px-4 py-6 text-center"
              } ${over ? "border-caution bg-caution-soft/50" : "border-line-strong bg-sunken/40"}`}
            >
              <input
                ref={input}
                type="file"
                multiple
                accept={REG_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  add(files);
                }}
              />
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="min-h-10 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-sunken"
              >
                Choose files
              </button>
              <p className="text-[12px] leading-snug text-ink-faint">
                {rows.length > 0
                  ? "Add more — drop or paste"
                  : "or drop / paste them here · PDF, JPG, PNG, WebP or HEIC, up to 10 MB each"}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-y border-line">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-faint">No files yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <RowView
                  key={row.id}
                  row={row}
                  vans={sorted}
                  locked={running}
                  onPick={(van) =>
                    setRows((was) =>
                      markDuplicates(
                        was.map((each) =>
                          each.id === row.id ? { ...each, van, matchedBy: van ? "picked" : null } : each,
                        ),
                      ),
                    )
                  }
                  onReplace={(replace) => patch(row.id, { replace })}
                  onRemove={() => setRows((was) => markDuplicates(was.filter((each) => each.id !== row.id)))}
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
              {finished
                ? `${done} uploaded`
                : `${queued.length} to upload${unmatched > 0 ? ` · ${unmatched} need a van` : ""}`}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={running}>
                {finished ? "Done" : "Cancel"}
              </Button>
              <Button variant="primary" onClick={upload} disabled={running || queued.length === 0} loading={running}>
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

function RowView({
  row,
  vans,
  locked,
  onPick,
  onReplace,
  onRemove,
}: {
  row: Row;
  vans: VanRecord[];
  locked: boolean;
  onPick: (van: VanRecord | null) => void;
  onReplace: (replace: boolean) => void;
  onRemove: () => void;
}) {
  const hasOne = !!row.van && !!activeRegistration(row.van.registrationDocs);
  const status = (() => {
    if (row.state === "done") return { tone: "ok", text: "Uploaded" };
    if (row.state === "uploading") return { tone: "muted", text: "Uploading…" };
    if (row.state === "failed") return { tone: "bad", text: row.error ?? "Did not upload" };
    if (row.problem) return { tone: "bad", text: row.problem };
    if (!row.van) return { tone: "warn", text: "Pick a van" };
    if (row.duplicateOf) return { tone: "muted", text: `Same van as ${row.duplicateOf} — skipped` };
    if (hasOne) return { tone: "warn", text: "Already has one" };
    return { tone: "ok", text: row.matchedBy === "vin" ? "Matched by VIN" : "Matched" };
  })();
  const tones: Record<string, string> = {
    ok: "border-arrived-line bg-arrived-soft text-arrived",
    bad: "border-overdue-line bg-overdue-soft text-overdue",
    warn: "border-warn-line bg-warn-soft text-warn",
    muted: "border-line bg-sunken text-ink-muted",
  };
  const kind = guessKind(row.file);
  const pickable = !row.problem && row.state === "waiting" && !locked;

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 ${willUpload(row) || row.state !== "waiting" ? "" : "opacity-80"}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-md border border-line bg-white text-[10px] font-bold uppercase text-ink-muted">
        {kind === "pdf" ? "PDF" : kind ? "IMG" : <RegIcon className="size-4" />}
      </span>

      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-[13px] text-ink" title={row.file.name}>
          {row.file.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="text-ink-faint">→</span>
          {pickable && (!row.van || row.matchedBy === "picked" || row.matchedBy === "vin") ? (
            <select
              value={row.van?.id ?? ""}
              onChange={(event) => onPick(vans.find((van) => van.id === event.target.value) ?? null)}
              aria-label={`Van for ${row.file.name}`}
              className="tnum min-h-8 rounded-md border border-line-strong bg-surface px-1.5 font-mono text-[12px] font-bold text-ink"
            >
              <option value="">Choose van…</option>
              {vans.map((van) => (
                <option key={van.id} value={van.id}>
                  {van.van}
                </option>
              ))}
            </select>
          ) : (
            <span className={`tnum font-mono font-bold ${row.van ? "text-ink" : "text-ink-faint"}`}>
              {row.van?.van ?? "—"}
            </span>
          )}
          <span className={`max-w-full truncate rounded-md border px-1.5 py-px text-[11px] font-bold ${tones[status.tone]}`}>
            {status.text}
          </span>
        </div>
      </div>

      {hasOne && !row.problem && !row.duplicateOf && row.state === "waiting" ? (
        <div
          role="group"
          aria-label={`${row.van!.van} already has a registration`}
          className="flex shrink-0 rounded-lg border border-line-strong p-0.5 text-[12px] font-semibold"
        >
          {(
            [
              [false, "Skip"],
              [true, "Replace"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              disabled={locked}
              aria-pressed={row.replace === value}
              onClick={() => onReplace(value)}
              className={`min-h-8 rounded-md px-2.5 transition-colors ${
                row.replace === value ? (value ? "bg-caution-soft text-caution" : "bg-sunken text-ink") : "text-ink-faint hover:text-ink"
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
          onClick={onRemove}
          aria-label={`Take ${row.file.name} off the list`}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
    </li>
  );
}
