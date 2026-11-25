"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocViewer, warmPdfRenderer } from "@/components/DocViewer";

/**
 * The driver's registration lookup — reg.swfl.app.
 *
 * One job: get a van's registration (or its QR) onto the screen in front of
 * an officer, fast. So the page is a PIN once, then one box and one button.
 * Nothing about the fleet shows until a van number has been typed and Search
 * pressed, and then only that van.
 *
 * High-contrast and plain on purpose — big type, thick borders, the phone's
 * own font — so it reads in morning sun and loads on one bar.
 */

type Doc = { path: string; token: string; expiresAt: number };
type Result = {
  van: string;
  expires: string;
  expiresLabel: string;
  state: "ok" | "soon" | "expired" | "none";
  daysLeft: number | null;
  registration: Doc | null;
  qr: Doc | null;
};

type Search =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; query: string; results: Result[]; tooMany: boolean };

class PinNeeded extends Error {}

async function fetchSearch(query: string): Promise<{ results: Result[]; tooMany: boolean }> {
  const response = await fetch(`/api/reg/search?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    results?: Result[];
    tooMany?: boolean;
    error?: string;
    pin?: boolean;
  };
  if (body.pin) throw new PinNeeded();
  if (!response.ok) throw new Error(body.error ?? "Search did not work. Try again.");
  return { results: body.results ?? [], tooMany: !!body.tooMany };
}

async function fetchDoc(doc: Doc): Promise<Blob> {
  const response = await fetch(doc.path, {
    headers: { "X-Reg-View": "1", "X-Reg-Token": doc.token },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; pin?: boolean };
    if (body.pin) throw new PinNeeded();
    throw new Error(body.error ?? "The document could not be opened. Try again.");
  }
  return response.blob();
}

/* ------------------------------------------------------------------------ */

export function RegApp({ locked: initiallyLocked }: { locked: boolean }) {
  const [locked, setLocked] = useState(initiallyLocked);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header>
        <h1 className="text-[30px] font-black leading-none tracking-tight">
          <span className="text-reg-blue">SWFL</span> <span className="text-reg-red">Reg</span>{" "}
          <span className="text-reg-black">&amp; QRs</span>
        </h1>
        <div aria-hidden="true" className="mt-3 grid h-1.5 grid-cols-3">
          <span className="bg-reg-blue" />
          <span className="bg-reg-red" />
          <span className="bg-reg-black" />
        </div>
      </header>

      <main className="mt-7 flex-1">
        {locked ? <PinForm onUnlocked={() => setLocked(false)} /> : <Lookup onPinNeeded={() => setLocked(true)} />}
      </main>

      <footer className="mt-10 text-[13px] leading-snug text-reg-none">
        For showing at a traffic stop. Something wrong or missing? Call dispatch.
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function PinForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setError("The PIN is 4 to 6 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reg/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "That did not work. Try again.");
        setPin("");
        input.current?.focus();
        return;
      }
      onUnlocked();
    } catch {
      setError("No connection. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="reg-pin" className="block text-[17px] font-bold">
        Driver PIN
      </label>
      <p id="reg-pin-help" className="mt-1 text-[15px] text-reg-none">
        Ask dispatch for it. This phone remembers it for 30 days.
      </p>
      <input
        ref={input}
        id="reg-pin"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-describedby={error ? "reg-pin-help reg-pin-error" : "reg-pin-help"}
        aria-invalid={!!error}
        className="mt-3 h-16 w-full rounded-lg border-[3px] border-reg-black bg-white px-4 text-center text-[32px] font-black tracking-[0.5em] outline-none focus:border-reg-blue focus:ring-4 focus:ring-reg-blue/25"
      />
      {error ? (
        <p id="reg-pin-error" role="alert" className="mt-2 text-[16px] font-bold text-reg-red">
          {error}
        </p>
      ) : null}
      <BigButton type="submit" disabled={busy} className="mt-4">
        {busy ? "Checking…" : "Unlock"}
      </BigButton>
    </form>
  );
}

/* ------------------------------------------------------------------------ */

function Lookup({ onPinNeeded }: { onPinNeeded: () => void }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const [viewing, setViewing] = useState<{ result: Result; kind: "registration" | "qr" } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Documents already on their way, by path: opened the moment they are tapped. */
  const fetched = useRef(new Map<string, { token: string; blob: Promise<Blob> }>());

  useEffect(() => input.current?.focus(), []);

  const run = useCallback(
    async (raw: string) => {
      const typed = raw.trim();
      if (!typed) {
        setSearch({ status: "error", message: "Type the van number first." });
        return;
      }
      setSearch({ status: "loading" });
      try {
        const { results, tooMany } = await fetchSearch(typed);
        setSearch({ status: "done", query: typed, results, tooMany });
        // The officer is waiting: start loading the registration now, before it is tapped.
        if (results.some((result) => result.registration)) warmPdfRenderer();
        for (const result of results) {
          if (!result.registration) continue;
          const blob = fetchDoc(result.registration);
          blob.catch(() => fetched.current.delete(result.registration!.path));
          fetched.current.set(result.registration.path, { token: result.registration.token, blob });
        }
      } catch (error) {
        if (error instanceof PinNeeded) return onPinNeeded();
        setSearch({
          status: "error",
          message:
            error instanceof TypeError
              ? "No connection. Check your signal and try again."
              : error instanceof Error
                ? error.message
                : "Search did not work. Try again.",
        });
      }
    },
    [onPinNeeded],
  );

  /**
   * The document for the viewer. A token older than its ten minutes is
   * swapped for a fresh one by searching again, so a page left open since
   * the morning still works.
   */
  async function load(result: Result, kind: "registration" | "qr"): Promise<Blob> {
    let doc = result[kind];
    if (!doc) throw new Error("Nothing on file.");

    if (doc.expiresAt - 30_000 < Date.now() && search.status === "done") {
      const fresh = await fetchSearch(search.query).catch((error: unknown) => {
        if (error instanceof PinNeeded) onPinNeeded();
        throw error;
      });
      const again = fresh.results.find((entry) => entry.van === result.van)?.[kind];
      if (!again) throw new Error("This document is no longer on file. Search again.");
      doc = again;
    }

    const held = fetched.current.get(doc.path);
    if (held && held.token === doc.token) return held.blob;
    try {
      return await fetchDoc(doc);
    } catch (error) {
      if (error instanceof PinNeeded) {
        onPinNeeded();
        throw new Error("Enter the PIN again.");
      }
      throw error;
    }
  }

  const close = useCallback(() => setViewing(null), []);

  return (
    <>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          input.current?.blur();
          void run(query);
        }}
      >
        <label htmlFor="reg-van" className="block text-[17px] font-bold">
          Van number
        </label>
        <input
          ref={input}
          id="reg-van"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. 56"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={24}
          className="mt-2 h-16 w-full rounded-lg border-[3px] border-reg-black bg-white px-4 text-[28px] font-black uppercase tracking-wide outline-none placeholder:font-semibold placeholder:normal-case placeholder:text-reg-line focus:border-reg-blue focus:ring-4 focus:ring-reg-blue/25"
        />
        <BigButton type="submit" disabled={search.status === "loading"} className="mt-3">
          {search.status === "loading" ? "Searching…" : "Search"}
        </BigButton>
      </form>

      <div aria-live="polite" className="mt-6">
        {search.status === "error" ? (
          <Notice tone="bad">{search.message}</Notice>
        ) : search.status === "done" && search.tooMany ? (
          <Notice>
            More than two vans are numbered &ldquo;{search.query}&rdquo;. Type the letters too, exactly as on the van —
            for example <strong>RT56</strong>.
          </Notice>
        ) : search.status === "done" && search.results.length === 0 ? (
          <Notice>
            No van &ldquo;{search.query}&rdquo; found. Check the number painted on the van and try again.
          </Notice>
        ) : search.status === "done" ? (
          <ul className="space-y-4">
            {search.results.map((result) => (
              <li key={result.van}>
                <VanCard result={result} onOpen={(kind) => setViewing({ result, kind })} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {viewing ? (
        <DocViewer
          key={`${viewing.result.van}:${viewing.kind}`}
          label={`${viewing.kind === "qr" ? "QR code" : "Registration"} for ${viewing.result.van}`}
          expiredOn={viewing.kind === "registration" && viewing.result.state === "expired" ? viewing.result.expiresLabel : null}
          load={() => load(viewing.result, viewing.kind)}
          onClose={close}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------ */

function VanCard({ result, onOpen }: { result: Result; onOpen: (kind: "registration" | "qr") => void }) {
  return (
    <article className="overflow-hidden rounded-lg border-[3px] border-reg-black" aria-label={`Van ${result.van}`}>
      <div className="px-4 pb-3 pt-3.5">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-reg-none">Van</p>
        <p className="text-[44px] font-black leading-none tracking-tight tabular-nums">{result.van}</p>
      </div>
      <Status result={result} />
      <div className="space-y-2.5 p-4">
        {result.registration ? (
          <BigButton onClick={() => onOpen("registration")}>Show registration</BigButton>
        ) : (
          <p className="rounded-lg border-[3px] border-dashed border-reg-line px-4 py-3 text-center text-[16px] font-bold text-reg-none">
            No registration on file — call dispatch
          </p>
        )}
        {result.qr ? (
          <BigButton variant="outline" onClick={() => onOpen("qr")}>
            Show QR code
          </BigButton>
        ) : null}
      </div>
    </article>
  );
}

function Status({ result }: { result: Result }) {
  const { state, daysLeft, expiresLabel } = result;
  const face =
    state === "ok"
      ? "bg-reg-ok text-white"
      : state === "soon"
        ? "bg-reg-soon text-reg-black"
        : state === "expired"
          ? "bg-reg-red text-white"
          : "bg-reg-none text-white";
  const headline =
    state === "ok"
      ? "Valid"
      : state === "soon"
        ? daysLeft === 0
          ? "Expires today"
          : daysLeft === 1
            ? "Expires tomorrow"
            : `Expires in ${daysLeft} days`
        : state === "expired"
          ? "Expired"
          : "No expiry date on file";

  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5 ${face}`}>
      <span className="text-[18px] font-black uppercase tracking-wide">{headline}</span>
      {expiresLabel ? (
        <span className="text-[16px] font-bold tabular-nums">
          {state === "expired" ? "on " : "until "}
          {expiresLabel}
        </span>
      ) : null}
    </div>
  );
}

function Notice({ tone = "plain", children }: { tone?: "plain" | "bad"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={`rounded-lg border-[3px] px-4 py-3.5 text-[17px] font-semibold leading-snug ${
        tone === "bad" ? "border-reg-red text-reg-red" : "border-reg-black"
      }`}
    >
      {children}
    </p>
  );
}

function BigButton({
  variant = "solid",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline" }) {
  return (
    <button
      type="button"
      {...props}
      className={`flex h-16 w-full items-center justify-center rounded-lg text-[20px] font-black uppercase tracking-wide transition-transform focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-reg-blue active:scale-[0.98] disabled:opacity-60 ${
        variant === "solid"
          ? "bg-reg-blue text-white"
          : "border-[3px] border-reg-black bg-white text-reg-black"
      } ${className}`}
    />
  );
}
