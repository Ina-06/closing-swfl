/**
 * The one thing everybody needs to hear tonight.
 *
 * Blue, and that is the whole point of it. Amber on this app means one driver
 * did something — an infraction, a note about him, a returns line that does not
 * add up. This is not about a driver at all: the gate code changed, the fuel
 * card is in the office, nobody parks on the north side. Reading it in the same
 * colour as an infraction would have Karim looking for whose it was.
 *
 * Named as well as coloured, because a colour is a hint and a strip that says
 * "Broadcast note" is a fact. It is the same words on both screens, so when the
 * dispatcher says "it's on the broadcast" there is something on Karim's phone
 * with that name on it.
 *
 * Shared rather than closer-only for exactly that reason. One note, one strip,
 * one name for it, read the same from the desk and from the yard.
 *
 * whitespace-pre-line because it can be more than one line and usually is not.
 * A broadcast that was typed as two lines was typed as two lines on purpose.
 */
export function BroadcastNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  /** Where it sits on the screen that is showing it. */
  className?: string;
}) {
  return (
    <div
      className={`flex gap-2.5 rounded-lg border border-brand-line bg-brand-soft px-3 py-2.5 ${className}`}
    >
      <span className="shrink-0 pt-px text-[10px] font-bold uppercase leading-[1.5] tracking-wider text-brand">
        Broadcast note
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-line text-[14px] leading-snug text-brand">
        {children}
      </span>
    </div>
  );
}
