"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HOME_FOR_ROLE, useAuth } from "@/lib/auth/AuthProvider";
import type { Role } from "@/lib/constants";

/**
 * Wraps everything inside a route group so a signed-out or wrong-role visitor
 * never sees the screen.
 *
 * This is a courtesy, not the security boundary — the real boundary is
 * firestore.rules, which decides per role what can be read and written. A
 * determined visitor can reach the markup; they cannot reach the data.
 */
export function RoleGate({
  allow,
  children,
}: {
  allow: readonly Role[];
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const router = useRouter();
  const signedOut = auth.status === "signedOut";

  useEffect(() => {
    if (signedOut) router.replace("/");
  }, [signedOut, router]);

  if (auth.status === "loading" || signedOut) {
    return <Waiting />;
  }

  if (auth.status === "unconfigured") {
    return (
      <Notice title="Firebase is not connected">
        This deployment is missing its <code className="font-mono">NEXT_PUBLIC_FIREBASE_*</code>{" "}
        environment variables.
      </Notice>
    );
  }

  if (!allow.includes(auth.role)) {
    return (
      <Notice title="Wrong screen for this key">
        You are signed in as <strong>{auth.role}</strong>.{" "}
        <Link
          href={HOME_FOR_ROLE[auth.role]}
          className="font-semibold text-brand underline underline-offset-2"
        >
          Go to your screen
        </Link>
        .
      </Notice>
    );
  }

  return <>{children}</>;
}

/**
 * Deliberately almost empty. Resolving a stored session takes a moment on a
 * cold phone, and a spinner that flashes for 200ms reads as a broken app.
 */
function Waiting() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" aria-busy="true">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-brand" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{children}</p>
    </section>
  );
}
