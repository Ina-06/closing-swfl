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
  },
  closing: {
    href: "/closer",
    label: "Closing",
    tone: "border-arrived-line bg-arrived-soft text-arrived",
  },
} as const;

export function PortalSwitch({ to }: { to: keyof typeof DOORS }) {
  const auth = useAuth();
  const door = DOORS[to];

  if (auth.status !== "signedIn") return null;
  if (auth.role !== "closer") return null;

  return (
    /* "Go to" in small grey capitals over the name. On its own the pill read
       as a label — which screen this is — rather than a way to another one,
       and beside a logo or a role chip saying the other name it was
       genuinely ambiguous. Stacked rather than beside, because the headers
       are full at phone width: two lines inside the button is narrower than
       the icon and name it replaces, and the colour already says where. */
    <Link
      href={door.href}
      aria-label={`Go to ${door.label}`}
      className={`flex min-h-9 shrink-0 flex-col items-start justify-center gap-0.5 rounded-xl border px-2.5 py-1 leading-none transition-[filter] active:brightness-[0.97] ${door.tone}`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        Go to
      </span>
      <span className="text-[12px] font-bold">{door.label}</span>
    </Link>
  );
}
