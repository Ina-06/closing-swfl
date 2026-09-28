"use client";

import { createContext, use, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Add a job, from the header.
 *
 * It used to sit beside a "Repairs" heading at the top of the board, and the
 * heading and the "9 jobs outstanding" under it were a band of screen that
 * said what the header and the To do tab already said. So the heading went,
 * the button moved up into the chrome where the role chip was, and the list
 * starts a hundred pixels higher on a phone.
 *
 * The header is the layout's and the sheet is the board's, so the one fact
 * they share — somebody has asked to type a new job — lives here between them.
 */

type Composer = { adding: boolean; setAdding: (adding: boolean) => void };

const AddJobContext = createContext<Composer>({
  adding: false,
  setAdding: () => {},
});

export function AddJobProvider({ children }: { children: React.ReactNode }) {
  const [adding, setAdding] = useState(false);
  const value = useMemo(() => ({ adding, setAdding }), [adding]);

  return <AddJobContext value={value}>{children}</AddJobContext>;
}

export function useAddJob(): Composer {
  return use(AddJobContext);
}

/**
 * Only for somebody the board will let write. A one-time stand-in is turned
 * away by RoleGate below the header, and a button above that refusal would be
 * offering the one thing the page has just said no to.
 */
export function AddJobButton() {
  const auth = useAuth();
  const { setAdding } = useAddJob();

  if (auth.status !== "signedIn") return null;
  if (auth.role !== "repairs" && auth.role !== "closer") return null;

  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-caution-line bg-caution-soft px-3 text-[12px] font-bold text-caution transition-[filter] active:brightness-[0.97]"
    >
      <span aria-hidden="true" className="text-[15px] leading-none">
        +
      </span>
      Add job
    </button>
  );
}
