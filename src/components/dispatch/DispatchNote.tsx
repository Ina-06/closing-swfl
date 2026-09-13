"use client";

import { useState } from "react";
import { NoteSheet } from "@/components/NoteSheet";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useEntries } from "@/lib/db/entries";
import { useTonightSession } from "@/lib/db/sessions";

/**
 * The dispatcher's way into the same note sheet Karim has.
 *
 * Karim's version is for what he has just been handed at the van. This one is
 * for the other half, which is everything dispatch knows hours earlier and will
 * not be awake to say: this one is on his last warning, ask this one why he was
 * an hour over on Tuesday, do not let this one leave without his key. Until now
 * the only way to get that to the yard was a note typed against a row, and a
 * row does not exist until the driver has phoned in — which is usually after
 * the moment anyone thought of it.
 *
 * Writing before the row exists is the whole point, and it already works: a
 * note against a name with no entry goes to `rosterNotes` on the session and
 * moves onto the row the moment one is created, from whichever side creates it
 * — see lib/notes. Nothing new is written here.
 *
 * In the top bar next to Sign out rather than on the sheet below, because it is
 * not about tonight's table: it is the one thing on this screen that is worth
 * doing from the drivers page or the archive, at the moment it occurs to
 * somebody.
 */
export function DispatchNote() {
  const auth = useAuth();
  const { nightKey, session } = useTonightSession();
  const { entries } = useEntries(nightKey);
  const [open, setOpen] = useState(false);

  /**
   * Nothing at all until there is a night to write on.
   *
   * The header renders on every dispatch route, including while the session is
   * still resolving and for a visitor the RoleGate below is about to turn away.
   * A button that opens onto an empty list is worse than no button — it reads
   * as the roster having been lost.
   */
  if (auth.status !== "signedIn" || auth.role !== "dispatcher") return null;
  if (!nightKey || !session) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:bg-sunken"
      >
        <span aria-hidden="true" className="text-[14px] leading-none">
          +
        </span>
        Note
      </button>

      {open ? (
        <NoteSheet
          nightKey={nightKey}
          session={session}
          entries={entries}
          uid={auth.uid}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
