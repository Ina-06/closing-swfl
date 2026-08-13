"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { HOME_FOR_ROLE, useAuth } from "@/lib/auth/AuthProvider";
import { StationDate } from "@/components/StationDate";
import { Wordmark } from "@/components/Wordmark";
import type { Role } from "@/lib/constants";

const LAST_ROLE_KEY = "closing:lastRole";

/**
 * The role this device signed in with last time, read straight from
 * localStorage. useSyncExternalStore rather than an effect so the server
 * render sees `null` and hydration stays honest — there is no correct value
 * to render before we are in the browser.
 */
function useLastRole(): Role | null {
  const stored = useSyncExternalStore(
    () => () => {},
    () => window.localStorage.getItem(LAST_ROLE_KEY),
    () => null,
  );
  return stored === "dispatcher" || stored === "closer" ? stored : null;
}

/**
 * One key, three doors.
 *
 * The key is never checked here — it is posted to /api/login, which compares
 * it server-side and hands back a Firebase custom token carrying the role.
 * Nothing in this file knows what the real key is.
 */
export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();

  const [key, setKey] = useState("");
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRole = useLastRole();
  const fieldRef = useRef<HTMLInputElement>(null);

  // Already signed in — hand them straight to their screen.
  const signedInRole = auth.status === "signedIn" ? auth.role : null;
  useEffect(() => {
    if (signedInRole) router.replace(HOME_FOR_ROLE[signedInRole]);
  }, [signedInRole, router]);

  async function submit(role: Role) {
    if (pending) return;
    if (!key.trim()) {
      setError("Enter the access key.");
      fieldRef.current?.focus();
      return;
    }

    setPending(role);
    setError(null);
    try {
      await auth.signIn(key.trim(), role);
      window.localStorage.setItem(LAST_ROLE_KEY, role);
      router.replace(HOME_FOR_ROLE[role]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface pt-safe">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <Wordmark />
          <StationDate className="tnum font-mono text-[11px] text-ink-muted" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10 pb-safe">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">
          Tonight&rsquo;s closing sheet
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
          Enter the station key, then pick the screen you need.
        </p>

        {auth.status === "unconfigured" ? (
          <SetupNotice />
        ) : (
          <form
            className="mt-7"
            onSubmit={(event) => {
              event.preventDefault();
              // Enter reuses the role this device signed in with last time —
              // Karim's phone is always the closer, and he types one-handed.
              if (lastRole) void submit(lastRole);
              else setError("Pick which screen you need.");
            }}
          >
            <label
              htmlFor="access-key"
              className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
            >
              Access key
            </label>
            <input
              id="access-key"
              ref={fieldRef}
              type="password"
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setError(null);
              }}
              autoComplete="current-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              disabled={pending !== null}
              /* 16px minimum: anything smaller makes iOS Safari zoom the page on focus. */
              className="mt-2 h-12 w-full rounded-lg border border-line-strong bg-surface px-3.5 font-mono text-[16px] tracking-wider text-ink outline-none transition-colors placeholder:tracking-normal placeholder:text-ink-faint focus:border-brand disabled:opacity-60"
              placeholder="••••••••"
            />

            {error ? (
              <p
                role="alert"
                className="mt-2.5 rounded-md border border-overdue-line bg-overdue-soft px-3 py-2 text-[13px] font-medium text-overdue"
              >
                {error}
              </p>
            ) : lastRole ? (
              <p className="mt-2.5 text-[12px] text-ink-faint">
                Enter signs in as {lastRole === "closer" ? "Closer" : "Dispatcher"}.
              </p>
            ) : null}

            <div className="mt-5 grid gap-3">
              <RoleButton
                accent="brand"
                label="Dispatcher"
                hint="Roster, ETAs, returns"
                device="Laptop"
                pending={pending === "dispatcher"}
                disabled={pending !== null}
                onClick={() => submit("dispatcher")}
                icon={
                  <>
                    <rect x="3" y="5" width="18" height="12" rx="1.5" />
                    <path d="M2 20h20" />
                  </>
                }
              />
              <RoleButton
                accent="arrived"
                label="Closer"
                hint="Arrivals, vans, End Day"
                device="Phone"
                pending={pending === "closer"}
                disabled={pending !== null}
                onClick={() => submit("closer")}
                icon={
                  <>
                    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
                    <path d="M10.5 18.5h3" />
                  </>
                }
              />
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-ink-muted">
                    One-time closer
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    For a stand-in covering the close.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  title="Arrives in Phase 8"
                  className="shrink-0 cursor-not-allowed rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-ink-faint"
                >
                  Not yet
                </button>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function RoleButton({
  label,
  hint,
  device,
  accent,
  icon,
  pending,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  device: string;
  accent: "brand" | "arrived";
  icon: React.ReactNode;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone =
    accent === "brand"
      ? "text-brand before:bg-brand hover:border-brand-line hover:bg-brand-soft/50"
      : "text-arrived before:bg-arrived hover:border-arrived-line hover:bg-arrived-soft/50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      /* min-h-14: thumb-sized, because the closer taps this in a dark parking lot. */
      className={`group relative flex min-h-14 items-center gap-3.5 overflow-hidden rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 disabled:opacity-60 ${tone}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5 shrink-0"
        aria-hidden="true"
      >
        {icon}
      </svg>

      <span className="flex-1">
        <span className="block text-[15px] font-bold tracking-tight text-ink">
          {label}
        </span>
        <span className="mt-0.5 block text-[12px] text-ink-muted">{hint}</span>
      </span>

      {pending ? (
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-current" />
      ) : (
        <span className="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          {device}
        </span>
      )}
    </button>
  );
}

/** Only the person deploying ever sees this. */
function SetupNotice() {
  return (
    <div className="mt-7 rounded-xl border border-warn-line bg-warn-soft p-5">
      <h2 className="text-[15px] font-bold text-warn">Firebase is not connected</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        This deployment is missing its Firebase configuration. Add the{" "}
        <code className="font-mono text-[12px]">NEXT_PUBLIC_FIREBASE_*</code>{" "}
        variables, plus{" "}
        <code className="font-mono text-[12px]">FIREBASE_SERVICE_ACCOUNT_KEY</code>{" "}
        and <code className="font-mono text-[12px]">APP_ACCESS_KEY</code>, then
        redeploy.
      </p>
    </div>
  );
}
