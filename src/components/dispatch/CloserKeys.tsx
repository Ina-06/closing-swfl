"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Field";
import { postAuthed } from "@/lib/api";
import { getClientAuth } from "@/lib/firebase/client";
import { stationTimeLabel } from "@/lib/constants";
import type { KeyRow } from "@/app/api/keys/route";

/** Reads the list. Kept outside the component so it holds no state of its own. */
async function fetchKeys(): Promise<{ keys: KeyRow[]; error: string | null }> {
  const user = getClientAuth().currentUser;
  if (!user) return { keys: [], error: "Signed out. Sign in again." };

  const response = await fetch("/api/keys", {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });

  if (!response.ok) {
    const payload: { error?: string } = await response.json().catch(() => ({}));
    return { keys: [], error: payload.error ?? "Could not load the codes." };
  }

  const payload: { keys: KeyRow[] } = await response.json();
  return { keys: payload.keys, error: null };
}

/**
 * Issuing a code for whoever is covering the close tonight.
 *
 * The code is shown once, here, and then it is gone — nothing stores it and no
 * route can return it. That is deliberate and it is worth the inconvenience of
 * having to issue a second one if the first is lost.
 */
export function CloserKeys() {
  /**
   * The list, stamped with when it was read.
   *
   * That stamp is what decides whether a code reads as expired, rather than
   * the clock at render time. Codes last twelve hours and the list is re-read
   * after every action, so a few minutes of drift changes nothing — and it
   * keeps this component a pure function of its state.
   */
  const [loaded, setLoaded] = useState<{ keys: KeyRow[]; at: number } | null>(
    null,
  );
  const [reload, setReload] = useState(0);
  const [issued, setIssued] = useState<{ code: string; expiresAt: number } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    fetchKeys().then((result) => {
      if (!live) return;
      setLoaded({ keys: result.keys, at: Date.now() });
      if (result.error) setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [reload]);

  const load = useCallback(() => setReload((count) => count + 1), []);
  const keys = loaded?.keys ?? null;

  async function issue() {
    setBusy("issue");
    setError(null);
    try {
      const response = await postAuthed("/api/keys", { note });
      const payload: { code: string; expiresAt: number } = await response.json();
      setIssued(payload);
      setCopied(false);
      setNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue a code.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      await postAuthed("/api/keys/revoke", { id });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {issued ? (
        <IssuedCode
          code={issued.code}
          expiresAt={issued.expiresAt}
          copied={copied}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(issued.code);
              setCopied(true);
            } catch {
              // Clipboard blocked. The digits are on the screen either way.
              setError("Could not copy. Read it off the screen instead.");
            }
          }}
          onDone={() => setIssued(null)}
        />
      ) : (
        <section className="rounded-xl border border-line bg-surface px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-[220px] flex-1">
              <label
                htmlFor="key-note"
                className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
              >
                Who is it for
              </label>
              <input
                id="key-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional — so you know which is which"
                maxLength={60}
                className="mt-2 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
              />
            </div>
            <Button
              variant="primary"
              size="lg"
              loading={busy === "issue"}
              onClick={() => void issue()}
            >
              Issue a code
            </Button>
          </div>
        </section>
      )}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
          Codes issued
        </h2>

        {keys === null ? (
          <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        ) : keys.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-8 text-center text-[13px] text-ink-faint">
            None yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {keys.map((key) => (
              <li key={key.id}>
                <KeyRowCard
                  row={key}
                  now={loaded?.at ?? 0}
                  busy={busy === key.id}
                  onRevoke={() => void revoke(key.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The one moment the code exists on a screen.
 *
 * Big enough to read out over a bad phone line, and it does not go away on its
 * own — dismissing it is a decision, because there is no second chance to see
 * it.
 */
function IssuedCode({
  code,
  expiresAt,
  copied,
  onCopy,
  onDone,
}: {
  code: string;
  expiresAt: number;
  copied: boolean;
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <section className="rounded-xl border border-brand-line bg-brand-soft px-5 py-5 text-center">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand">
        Give this to them now
      </p>

      <p className="tnum mt-2 font-mono text-[44px] font-bold leading-none tracking-[0.15em] text-ink">
        {code}
      </p>

      <p className="mt-3 text-[13px] text-ink-muted">
        Works once. Expires at {stationTimeLabel(new Date(expiresAt))}, twelve
        hours from now.
      </p>
      <p className="mt-1 text-[12px] font-semibold text-brand">
        You will not be able to see it again.
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="lg" onClick={onCopy}>
          {copied ? "Copied" : "Copy the code"}
        </Button>
        <Button variant="secondary" size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}

function KeyRowCard({
  row,
  now,
  busy,
  onRevoke,
}: {
  row: KeyRow;
  /** When the list was read — see the note on `loaded`. */
  now: number;
  busy: boolean;
  onRevoke: () => void;
}) {
  const state = row.revokedAt
    ? { label: "Revoked", tone: "border-line bg-sunken text-ink-faint" }
    : row.usedAt
      ? {
          label: "In use",
          tone: "border-arrived-line bg-arrived-soft text-arrived",
        }
      : row.expiresAt < now
        ? { label: "Expired", tone: "border-line bg-sunken text-ink-faint" }
        : { label: "Waiting", tone: "border-brand-line bg-brand-soft text-brand" };

  // Revoking an expired or already-revoked code changes nothing, so the button
  // is only there while it would.
  const canRevoke = !row.revokedAt && row.expiresAt > now;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${state.tone}`}
          >
            {state.label}
          </span>
          {row.note ? (
            <span className="text-[14px] font-semibold">{row.note}</span>
          ) : (
            <span className="text-[14px] text-ink-faint">No label</span>
          )}
        </p>
        <p className="mt-1 text-[12px] text-ink-muted">
          Issued {stationTimeLabel(new Date(row.createdAt))} · expires{" "}
          {stationTimeLabel(new Date(row.expiresAt))}
          {row.usedAt
            ? ` · used ${stationTimeLabel(new Date(row.usedAt))}`
            : ""}
        </p>
      </div>

      {canRevoke ? (
        <Button variant="secondary" loading={busy} onClick={onRevoke}>
          Revoke
        </Button>
      ) : null}
    </div>
  );
}
