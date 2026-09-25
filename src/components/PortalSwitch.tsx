"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * The door between the close and the repairs board.
 *
 * Karim works both. A van comes in with a mirror hanging off, he writes it
 * against the driver and it lands on the board at End Day — and then somebody
 * asks him what is still outstanding, and until now the only way to answer was
 * to sign out, type the station key again and sign back in as Repairs. Twice,
 * because he then had to come back.
 *
 * So it is one pill in the header on each side, and it is the same component
 * both ways round because it is the same door. The only thing that differs is
 * which side of it you are standing on.
 *
 * It renders nothing for anybody else. A repairs-role session has no closing
 * screen to go back to — the roster, the ETAs and the clock-outs are all
 * somewhere that role cannot go, by design — so showing it the way out would
 * be offering a journey that ends at "wrong screen for this key". The
 * dispatcher is not offered the board for the same reason: it is no part of
 * the night, and the rules say so.
 *
 * A one-time stand-in does not get it either, and that is the one place in
 * this app where a borrowed code is not simply a closer. Everywhere else it
 * is: a stand-in covering the close does the close, every entry and every
 * clock-out and End Day itself. But this board is the station's rather than
 * the night's — a job opened in August is ticked off in September — and a code
 * that stops working in twelve hours has nothing to do on it.
 *
 * Hidden rather than shown and refused. A button that leads to "wrong screen
 * for this key" is worse than no button, and the same goes for a board full of
 * controls that bounce. firestore.rules draws the line in the same place, with
 * isPermanentCloser.
 */

const DOORS = {
  repairs: {
    href: "/repairs",
    label: "Repairs",
    /* Orange, the repairs portal's own colour, so the pill looks like where it
       goes rather than like the screen it is sitting on. */
    tone: "border-caution-line bg-caution-soft text-caution",
    icon: (
      <>
        <path d="M14.5 5.5a4 4 0 015.2 5.2l-8 8a4 4 0 01-5.2-5.2z" />
        <path d="M5.5 15.5l3 3" />
      </>
    ),
  },
  closing: {
    href: "/closer",
    label: "Closing",
    tone: "border-arrived-line bg-arrived-soft text-arrived",
    icon: (
      <>
        <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
        <path d="M10.5 18.5h3" />
      </>
    ),
  },
} as const;

export function PortalSwitch({ to }: { to: keyof typeof DOORS }) {
  const auth = useAuth();
  const door = DOORS[to];

  if (auth.status !== "signedIn") return null;
  if (auth.role !== "closer") return null;

  return (
    <Link
      href={door.href}
      className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-bold transition-[filter] active:brightness-[0.97] ${door.tone}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5 shrink-0"
        aria-hidden="true"
      >
        {door.icon}
      </svg>
      {door.label}
    </Link>
  );
}
