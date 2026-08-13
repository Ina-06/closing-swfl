"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Signing out is intentionally small and out of the way. Nobody should hit it
 * by accident at 10pm with half the wave still out — the session is meant to
 * last the whole night.
 */
export function SignOutButton({ className = "" }: { className?: string }) {
  const { signOut, status } = useAuth();
  const router = useRouter();

  if (status !== "signedIn") return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.replace("/");
      }}
      className={`rounded-md px-2 py-1 text-[12px] font-medium text-ink-faint transition-colors hover:bg-sunken hover:text-ink-muted ${className}`}
    >
      Sign out
    </button>
  );
}
