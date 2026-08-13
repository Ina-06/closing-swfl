"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  onIdTokenChanged,
  signInWithCustomToken,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { firebaseConfigured, getClientAuth } from "@/lib/firebase/client";
import { ROLES, type Role } from "@/lib/constants";

type AuthState =
  /** Still resolving the stored session — show nothing rather than a flash of the login screen. */
  | { status: "loading" }
  /** The NEXT_PUBLIC_FIREBASE_* vars are missing. Only reachable by whoever is deploying. */
  | { status: "unconfigured" }
  | { status: "signedOut" }
  | { status: "signedIn"; role: Role; uid: string };

type AuthContextValue = AuthState & {
  signIn: (key: string, role: Role) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(
    firebaseConfigured ? { status: "loading" } : { status: "unconfigured" },
  );

  useEffect(() => {
    if (!firebaseConfigured) return;

    /**
     * onIdTokenChanged rather than onAuthStateChanged: it also fires on the
     * hourly token refresh, so the role claim we hold never goes stale on a
     * phone that has been open all night.
     */
    return onIdTokenChanged(getClientAuth(), async (user) => {
      if (!user) {
        setState({ status: "signedOut" });
        return;
      }

      const { claims } = await user.getIdTokenResult();
      if (!isRole(claims.role)) {
        // A session without a role can do nothing anyway — the rules would
        // reject every read. Clear it so the login screen is reachable.
        await firebaseSignOut(getClientAuth());
        setState({ status: "signedOut" });
        return;
      }

      setState({ status: "signedIn", role: claims.role, uid: user.uid });
    });
  }, []);

  const signIn = useCallback(async (key: string, role: Role) => {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, role }),
    });

    const payload: { token?: string; error?: string } = await response
      .json()
      .catch(() => ({}));

    if (!response.ok || !payload.token) {
      throw new Error(payload.error ?? "Could not sign in.");
    }

    // The listener above sets the state once Firebase accepts the token.
    await signInWithCustomToken(getClientAuth(), payload.token);
  }, []);

  const signOut = useCallback(async () => {
    if (!firebaseConfigured) return;
    await firebaseSignOut(getClientAuth());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut }),
    [state, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return context;
}

/** Where each role lands after signing in. */
export const HOME_FOR_ROLE: Record<Role, string> = {
  dispatcher: "/dispatch",
  closer: "/closer",
  onetime: "/closer",
};
