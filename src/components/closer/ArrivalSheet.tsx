"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/Button";
import { CheckBar, CheckCycle, type Check } from "@/components/ui/Checks";
import { ErrorNote } from "@/components/ui/Field";
import { FlagTag } from "@/components/ui/FlagToggle";
import { flagsOn } from "@/components/closer/DriverCard";
import {
  clockOut,
  correctClockOut,
  markArrived,
  reopenEntry,
  saveYard,
  type YardFields,
} from "@/lib/db/closer";
import {
  CHECKS,
  METRICS,
  stationInstant,
  stationTimeInputValue,
  stationTimeLabel,
  type CheckField,
  type MetricTone,
} from "@/lib/constants";
import { lateLabel } from "@/lib/eta";
import { withNotes, type VanFlags } from "@/lib/vanIssues";
import type { Entry } from "@/lib/types";

/**
 * The sheet behind a card — one driver's whole record.
 *
 * Ordered the way the conversation goes. What dispatch already knows is at the
 * top, because Karim reads it before he says a word: three returns and an
 * infraction is a different hello. Then the arrival, then the van in front of
 * him, then the clock-out at the bottom, which is the last thing that happens
 * and the thing that finishes the record.
 */
export function ArrivalSheet({
  nightKey,
  entry,
  late,
  uid,
  onClose,
}: {
  nightKey: string;
  /** Read live from the snapshot, so a correction on the laptop lands here. */
  entry: Entry;
  late: number | null;
  uid: string;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    // Stop the list behind the sheet from scrolling under his thumb.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  /**
   * Every write on this screen, fired and not waited on.
   *
   * Firestore applies the change to the device before it goes anywhere, so the
   * screen has already moved by the time this returns — and out in the yard on
   * one bar, awaiting the server would leave him holding a spinner over a van
   * that is already recorded. A write the rules turn down comes back through
   * the listener as the card returning to where it was, which is the honest
   * signal and the only one that survives the sheet being closed.
   */
  const write = useCallback((action: Promise<void>, whenItFails: string) => {
    setError(null);
    action.catch((err: unknown) => {
      setError(describeWriteError(err, whenItFails));
    });
  }, []);

  const writeYard = useCallback(
    (fields: YardFields) => {
      write(
        saveYard(nightKey, entry.id, fields, uid),
        "The van details did not save.",
      );
    },
    [write, nightKey, entry.id, uid],
  );

  const inYard = entry.status === "arrived";
  const done = entry.status === "clockedOut";
  const stamped = entry.clockOut;

  function startEditing() {
    setDraft(
      stamped
        ? stationTimeInputValue(stamped.toDate())
        : stationTimeInputValue(new Date()),
    );
    setEditingTime(true);
  }

  function saveTime() {
    const [hours, minutes] = draft.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      setError("That time did not read as a time.");
      return;
    }
    write(
      correctClockOut(
        nightKey,
        entry.id,
        stationInstant(nightKey, hours, minutes),
        uid,
      ),
      "That time did not save.",
    );
    setEditingTime(false);
  }

  /** The clock-out, and the way out. He is finished with this driver. */
  function finish() {
    write(clockOut(nightKey, entry.id, uid), "The clock-out did not save.");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={entry.fullName}
        tabIndex={-1}
        className="animate-sheet absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-safe outline-none"
      >
        <div className="mx-auto max-w-lg px-4 pb-6 pt-2.5">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong"
          />

          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-bold leading-tight tracking-tight">
                {entry.fullName}
              </h2>
              {/* The ETA used to live here. It is down by the clock-out now,
                  where it is the number he is about to compare against. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {/* First, and not a flag: it says which of this driver's two
                    rows he is looking at, which decides whether anything else
                    on the sheet is the one he meant to open. */}
                {entry.secondTrip ? (
                  <span className="rounded-full border border-brand-line bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                    2nd trip
                  </span>
                ) : null}
                {flagsOn(entry).map((flag) => (
                  <FlagTag key={flag} flag={flag} />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-faint active:bg-sunken"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="size-5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          {entry.notes ? (
            <p className="mt-4 rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5 text-[14px] leading-snug text-warn">
              <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider">
                Note
              </span>
              {entry.notes}
            </p>
          ) : null}

          {/* First, because it is what he reads before he opens his mouth. */}
          <FromDispatch entry={entry} />

          <div className="mt-6 space-y-3">
            {/* Against the clock, wherever the clock is. For a driver still on
                the road that is the Arrived button; for one already finished it
                is the stamped time directly beneath this. In the yard the clock
                is the Clock out at the foot of the sheet, so it travels down
                there with it — see below. */}
            {entry.eta && !inYard ? (
              <EtaPanel eta={entry.eta} late={late} />
            ) : null}

            {entry.secondTrip ? (
              /* His second turn of the night. There is no Arrived to press —
                 by the time Karim is filling this in the trip is already over
                 — so the whole state block collapses to the one thing that is
                 still missing, which is what time it was. */
              <TripTimePanel
                entry={entry}
                editing={editingTime}
                draft={draft}
                onDraft={setDraft}
                onStartEditing={startEditing}
                onCancelEditing={() => setEditingTime(false)}
                onSaveTime={saveTime}
              />
            ) : done ? (
              <ClockedOutPanel
                entry={entry}
                editing={editingTime}
                draft={draft}
                onDraft={setDraft}
                onStartEditing={startEditing}
                onCancelEditing={() => setEditingTime(false)}
                onSaveTime={saveTime}
                onStamp={() =>
                  write(
                    clockOut(nightKey, entry.id, uid),
                    "The clock-out did not save.",
                  )
                }
                onReopen={() =>
                  write(
                    reopenEntry(nightKey, entry.id, uid),
                    "That did not go through.",
                  )
                }
              />
            ) : inYard ? (
              <InYardPanel
                onReopen={() =>
                  write(
                    reopenEntry(nightKey, entry.id, uid),
                    "That did not go through.",
                  )
                }
              />
            ) : (
              <Button
                variant="arrived"
                size="lg"
                onClick={() =>
                  write(
                    markArrived(nightKey, entry.id, uid),
                    "That did not go through.",
                  )
                }
                className="min-h-14 w-full text-[17px]"
              >
                Arrived
              </Button>
            )}
          </div>

          {/* Only once he is in. On a driver still out these are eight controls
              he cannot use standing between him and the one he can. */}
          {inYard || done ? (
            <VanPanel entry={entry} onSave={writeYard} />
          ) : null}

          <div className="mt-6 space-y-3">
            {/* Directly above the button that stamps the real time, and set in
                the same figures at the same size, because the only thing this
                number is for now is being read against that one. */}
            {entry.eta && inYard && !entry.secondTrip ? (
              <EtaPanel eta={entry.eta} late={late} />
            ) : null}

            {inYard && !entry.secondTrip ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={finish}
                  className="min-h-14 w-full text-[16px]"
                >
                  Clock out
                  <ArrowRight />
                </Button>
                <p className="text-center text-[12px] text-ink-faint">
                  Stamps the time and takes you back to the list.
                </p>
              </>
            ) : (
              <Button
                variant={done ? "primary" : "secondary"}
                size="lg"
                onClick={onClose}
                className="min-h-14 w-full text-[16px]"
              >
                {done ? "Done" : "Close"}
                {done ? <ArrowRight /> : null}
              </Button>
            )}
          </div>

          {/* Pinned to the bottom of the sheet rather than tucked under the
              header. The writes that fail are the checks and the van number,
              and by the time he is tapping those the top of the sheet is well
              off the screen — an explanation up there is an explanation he
              never sees. */}
          {error ? (
            <div className="sticky bottom-2 z-10 mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * What to say when a write comes back refused.
 *
 * Worth the special case because of how this one fails. The write lands on the
 * device first, so the control moves — a check goes green, a van number
 * appears — and only then does the server turn it down and Firestore roll it
 * back. From where Karim is standing that is not an error, it is a button that
 * un-presses itself, and no amount of it being technically correct makes that
 * readable.
 *
 * It happens because the rules are the one part of this app that does not ship
 * with the deploy: publish a version of the phone that knows six checks against
 * a rule file that knows three and every tap on the new ones bounces. So the
 * message names that, rather than repeating Firestore's "Missing or
 * insufficient permissions" at someone holding a phone in a dark yard.
 */
function describeWriteError(error: unknown, fallback: string): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code === "permission-denied") {
    return "The station's security rules turned that down, so it has snapped back. They need publishing again in the Firebase console — nothing is wrong with this phone.";
  }

  return error instanceof Error ? error.message : fallback;
}

/**
 * What he said on the phone, sitting against what actually happened.
 *
 * On one line, label and figure together, because that is how it gets said out
 * loud — "ETA five twenty-five" — and because the two numbers this is here to
 * be read against are each one line high. Same typeface and same size as the
 * clock-out beneath it, so the pair reads as one comparison rather than as a
 * heading and a number.
 *
 * It is never far from that clock-out now. Whichever control is the clock for
 * this driver's state — Arrived, Clock out, or the stamped time itself — this
 * renders directly against it, which is the whole reason to show it at all:
 * eleven minutes late is a different handover to bang on time.
 */
function EtaPanel({ eta, late }: { eta: string; late: number | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-1 rounded-xl border border-line bg-sunken px-4 py-3">
      <span className="text-[15px] font-bold uppercase tracking-[0.08em] text-ink-faint">
        ETA:
      </span>
      <span className="tnum font-mono text-[30px] font-bold leading-none tracking-tight text-ink">
        {eta}
      </span>
      {late !== null ? (
        <span className="rounded-full border border-overdue-line bg-overdue-soft px-2.5 py-0.5 text-[11px] font-bold text-overdue">
          {lateLabel(late)}
        </span>
      ) : null}
    </div>
  );
}

function ArrowRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * He is here, and Karim is part-way through the handover.
 *
 * Deliberately small. The work is underneath it and the clock-out is at the
 * bottom; this is only here so a driver in this state never looks the same as
 * one still out on the road.
 */
function InYardPanel({ onReopen }: { onReopen: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-arrived-line bg-arrived-soft px-3.5 py-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-arrived text-[16px] font-bold text-ink-inverse"
      >
        ✓
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold leading-tight text-arrived">
          In the yard
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-arrived/80">
          Go through the van, then clock him out.
        </span>
      </span>
      <button
        type="button"
        onClick={onReopen}
        className="min-h-11 shrink-0 rounded-lg px-2.5 text-[13px] font-semibold text-arrived/90 active:bg-arrived-soft"
      >
        Undo
      </button>
    </div>
  );
}

/**
 * What Karim fills in at the van.
 *
 * Nothing here has a Save button. A field writes itself the moment he is done
 * with it — Enter, a tap elsewhere, or leaving the sheet — so there is no state
 * in which what is on the screen is not on its way to the database, and nothing
 * commits while he is still mid-number.
 */
function VanPanel({
  entry,
  onSave,
}: {
  entry: Entry;
  onSave: (fields: YardFields) => void;
}) {
  const van = useSavedField(entry.van, (value) => onSave({ van: value.trim() }));
  const issues = useSavedField(entry.vanIssues, (value) =>
    onSave({ vanIssues: value.trim() }),
  );

  const box = useRef<HTMLTextAreaElement>(null);
  /** Set by the tap that crossed the van, read by the layout effect below. */
  const wantsCaret = useRef(false);
  /**
   * That the box was asked for on this tap, before the write has come back.
   *
   * Waiting for Firestore to echo the cross would put the textarea on screen a
   * frame or two after the finger left the glass, and on iOS a field focused
   * outside the gesture that asked for it gets no keyboard. So the cross is
   * believed here first and confirmed by the record afterwards.
   */
  const [crossedNow, setCrossedNow] = useState(false);

  /**
   * Whether there is anything to write in.
   *
   * Crossing the van opens it, which is the whole point of the control. The
   * other three are there so nothing already recorded can be hidden by it: text
   * on the record, or a grounded van, means there is something to read, and a
   * field Karim cannot see is a field he cannot correct.
   */
  const issuesOpen =
    crossedNow ||
    entry.vanOk === false ||
    entry.vanIssues.trim() !== "" ||
    entry.grounded;

  /**
   * Straight into the box, caret at the end, on the tap that opened it.
   *
   * A layout effect rather than a passive one because it has to run before the
   * browser hands control back — that is what keeps this inside the tap, and
   * the keyboard with it. No dependency list: the ref is the guard, so it fires
   * on the render that put the box on screen and on no other.
   */
  useLayoutEffect(() => {
    if (!wantsCaret.current) return;
    const field = box.current;
    if (!field) return;
    wantsCaret.current = false;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });

  /**
   * Both self-writing controls go through here, and both rebuild the box.
   *
   * The note is composed from the draft rather than from the entry, so a
   * sentence he is half-way through typing when he crosses the fuel is carried
   * through the write instead of being lost to it. And the draft moves with it:
   * it is what the textarea is showing and what its own save would send, so
   * leaving it behind would mean the next thing he typed put the old text —
   * without the note — straight back over the top.
   */
  function writeNotes(patch: YardFields, flags: VanFlags) {
    const next = withNotes(issues.value, flags);
    issues.replace(next);
    patch.vanIssues = next;
  }

  /** A check, and — for fuel alone — the sentence it writes underneath. */
  function setCheck(field: CheckField, value: Check) {
    const patch = checkPatch(field, value);

    if (field === "fuel") {
      writeNotes(patch, { fuel: value, grounded: entry.grounded });
    }

    onSave(patch);
  }

  /** The van is off the road. One write: the flag and the sentence together. */
  function setGrounded(grounded: boolean) {
    const patch: YardFields = { grounded };
    writeNotes(patch, { fuel: entry.fuel, grounded });
    onSave(patch);
  }

  /**
   * Is there anything wrong with the van.
   *
   * Crossing it is the only way into the box below, so this does that too
   * rather than leaving him to find it: the answer to "what is wrong with it"
   * is the next thing he was going to say, and he is holding the phone in one
   * hand.
   */
  function setVanOk(value: Check) {
    setCrossedNow(value === false);
    if (value === false) wantsCaret.current = true;
    onSave({ vanOk: value });
  }

  return (
    <section className="mt-6">
      <SectionTitle>The van</SectionTitle>

      <label htmlFor="van" className="sr-only">
        Van number for {entry.fullName}
      </label>
      <input
        id="van"
        value={van.value}
        onChange={(event) => van.change(event.target.value)}
        onBlur={van.flush}
        /* Enter closes the keyboard and saves, so the phone behaves the way he
           expects a number field to. Prevented first because a bare Enter in a
           lone text input would otherwise try to submit something. */
        enterKeyHint="done"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        /* Van numbers carry letters as often as digits, so this stays a full
           keyboard — but capitalised, because that is how they are painted on
           the side of the van and how they end up on the sheet. */
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="Van number"
        className="tnum mt-2 w-full rounded-xl border border-line-strong bg-surface px-4 py-3.5 text-center font-mono text-[26px] font-bold tracking-wide text-ink outline-none transition-colors placeholder:text-[17px] placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-ink-faint focus:border-brand"
      />

      {/* Three across, in the order he walks them. Six across would put the
          last one past the reach of a thumb on the hand holding the phone.
          Equal rows, so the one check whose name runs to two lines does not
          make its row taller than the other and leave the grid looking like it
          slipped. */}
      <div className="mt-2.5 grid auto-rows-fr grid-cols-3 gap-2">
        {CHECKS.map((check, index) => (
          <CheckCycle
            key={check.field}
            label={check.label}
            value={entry[check.field]}
            onChange={(value) => setCheck(check.field, value)}
            /* A last row holding one tile reads as a grid that slipped, so it
               takes the whole row instead. Worked out from the count rather
               than named, so the seventh check is still one line in
               constants. */
            className={
              index === CHECKS.length - 1 && CHECKS.length % 3 === 1
                ? "col-span-3"
                : ""
            }
          />
        ))}
      </div>

      {/* The gate. Most vans come back with nothing wrong, and for those this
          is the whole of it — one tap, green, done, and the sheet stays as
          short as the night was. Crossing it is what opens the box, because a
          box is only worth a keyboard when there is something to put in it. */}
      <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        Van issues
      </p>
      <div className="mt-1.5">
        <CheckBar
          label="Van issues"
          words={{
            null: "Not checked yet",
            true: "None",
            false: "Write them below",
          }}
          value={entry.vanOk}
          onChange={setVanOk}
        />
      </div>

      {issuesOpen ? (
        <>
          <label htmlFor="van-issues" className="sr-only">
            What is wrong with the van
          </label>
          <textarea
            id="van-issues"
            ref={box}
            value={issues.value}
            onChange={(event) => issues.change(event.target.value)}
            onBlur={issues.flush}
            rows={2}
            placeholder="What is wrong with it"
            className="mt-2 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[16px] leading-snug text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
          />

          {/* Under the box because it writes into it, and smaller than the
              checks because it is not one of them — those are things that came
              back with the van, this is a decision about the van. Two states
              only: a van nobody has grounded is not grounded, and there is no
              third thing it could be. */}
          <button
            type="button"
            onClick={() => setGrounded(!entry.grounded)}
            aria-pressed={entry.grounded}
            className={`mt-2 flex min-h-12 w-full items-center gap-2.5 rounded-xl border px-3.5 text-left transition-colors active:brightness-[0.97] ${
              entry.grounded
                ? "border-overdue-line bg-overdue-soft"
                : "border-line bg-surface"
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid size-6 shrink-0 place-items-center rounded-md border text-[14px] font-bold ${
                entry.grounded
                  ? "border-overdue bg-overdue text-ink-inverse"
                  : "border-line-strong bg-surface text-transparent"
              }`}
            >
              ✓
            </span>
            <span
              className={`text-[13px] font-bold uppercase tracking-wider ${
                entry.grounded ? "text-overdue" : "text-ink-faint"
              }`}
            >
              Grounded
            </span>
          </button>
        </>
      ) : null}
    </section>
  );
}

/** One check as a write. Built by assignment so the key stays typed. */
function checkPatch(field: CheckField, value: Check): YardFields {
  const patch: YardFields = {};
  patch[field] = value;
  return patch;
}

/**
 * The dispatcher's half, read-only.
 *
 * Karim needs to see it — a driver with three returns is a driver he is about
 * to have a conversation with — but it is not his to change, and the rules
 * would refuse the write anyway. Showing it flat rather than as disabled inputs
 * is the honest rendering: these are facts, not controls someone switched off.
 */
function FromDispatch({ entry }: { entry: Entry }) {
  const metric = METRICS.find((option) => option.value === entry.metric);
  const infraction = entry.infractions.trim();

  const blank =
    !entry.returnsRaw.trim() &&
    !entry.infractions.trim() &&
    entry.rescues === 0 &&
    entry.performance === null &&
    !metric;

  return (
    <section className="mt-5">
      <SectionTitle>From dispatch</SectionTitle>

      {blank ? (
        <p className="mt-2 rounded-xl border border-dashed border-line-strong bg-sunken/50 px-3.5 py-3 text-[13px] leading-relaxed text-ink-faint">
          {entry.addedByCloser
            ? "Nothing yet — you added him, so dispatch fills this in afterwards."
            : "Nothing entered for him yet."}
        </p>
      ) : (
        <dl className="mt-2 divide-y divide-line rounded-xl border border-line bg-sunken/50">
          <Row
            term="Performance"
            value={<Performance direction={entry.performance} metric={metric} />}
          />
          <Row term="Returns" value={entry.returnsRaw.trim() || "None"} />
          <Row
            term="Infractions"
            value={
              infraction ? (
                /* An infraction is the one thing on this sheet Karim has to
                   act on, so it does not sit in the list looking like the
                   rest of it. */
                <span className="-my-0.5 block rounded-md border border-warn-line bg-warn-soft px-2 py-1.5 font-semibold text-warn">
                  {infraction}
                </span>
              ) : (
                "None"
              )
            }
          />
          <Row term="Rescues" value={<Rescues count={entry.rescues} />} />
        </dl>
      )}
    </section>
  );
}

/**
 * Rescues, signed and nothing else.
 *
 * Green for packages this driver picked up off someone else, red for packages
 * that had to be taken off him. The sign carries the whole meaning, so the
 * number keeps its `+` — a bare "23" would be the same glyphs as "-23" minus
 * the one character that matters.
 */
function Rescues({ count }: { count: number }) {
  if (count === 0) return <>None</>;

  const took = count > 0;

  return (
    <span
      className={`tnum inline-block rounded-md border px-2 py-0.5 font-mono text-[15px] font-bold ${
        took
          ? "border-arrived-line bg-arrived-soft text-arrived"
          : "border-overdue-line bg-overdue-soft text-overdue"
      }`}
    >
      {took ? "+" : "-"}
      {Math.abs(count)}
    </span>
  );
}

/** The scale reads as a scale: green down to amber, orange, red, then darker. */
const METRIC_TONE: Record<MetricTone, string> = {
  good: "border-arrived-line bg-arrived-soft text-arrived",
  warn: "border-warn-line bg-warn-soft text-warn",
  caution: "border-caution-line bg-caution-soft text-caution",
  bad: "border-overdue-line bg-overdue-soft text-overdue",
  critical: "border-critical-line bg-critical-soft text-critical",
};

/**
 * Which way the driver's week is going, and where he sits on the scale.
 *
 * For Karim's eyes only — it is not a column on the paper sheet, so it will not
 * appear on the PDF. He is about to talk to this person; the arrow and the
 * colour are the part of that conversation he wants before he opens his mouth.
 */
function Performance({
  direction,
  metric,
}: {
  direction: Entry["performance"];
  metric: (typeof METRICS)[number] | undefined;
}) {
  if (!direction && !metric) return <>Not set</>;

  return (
    <span className="flex items-center gap-2">
      {direction ? (
        <span
          role="img"
          aria-label={direction === "up" ? "Trending up" : "Trending down"}
          className="text-[20px] leading-none"
        >
          {direction === "up" ? "📈" : "📉"}
        </span>
      ) : null}
      {metric ? (
        <span
          title={metric.title}
          className={`rounded-md border px-2 py-0.5 font-mono text-[14px] font-bold ${METRIC_TONE[metric.tone]}`}
        >
          {metric.label}
        </span>
      ) : null}
    </span>
  );
}

function Row({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-3.5 py-2.5">
      <dt className="w-[86px] shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {term}
      </dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-snug text-ink">
        {value}
      </dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
      {children}
    </h3>
  );
}

/**
 * A text field that saves itself when he is finished with it.
 *
 * It used to write on a timer a beat after the last keystroke. That was wrong
 * for a van number: he is reading digits off the side of a van and glancing
 * back at the phone, and a field that commits itself mid-pause feels like it
 * has been taken off him. Now nothing happens until he leaves the box — Enter,
 * a tap somewhere else, or the clock-out.
 *
 * The unmount flush is what keeps "never lose typed text" true anyway: if the
 * sheet is dismissed with a half-typed number in the field, that number is
 * still written on the way out.
 *
 * Drafts start from the entry and are never re-synced, which is safe because
 * the sheet is keyed by driver — a different driver is a different component —
 * and because the rules make the closer the only writer of these fields.
 */
function useSavedField(initial: string, save: (next: string) => void) {
  const [value, setValue] = useState(initial);
  const state = useRef({ typed: initial, written: initial, save });

  useEffect(() => {
    state.current.save = save;
  });

  const flush = useCallback(() => {
    const current = state.current;
    if (current.typed.trim() === current.written.trim()) return;
    current.written = current.typed;
    current.save(current.typed);
  }, []);

  useEffect(() => flush, [flush]);

  function change(next: string) {
    setValue(next);
    state.current.typed = next;
  }

  /**
   * Rewrite the draft from outside, for something already being saved.
   *
   * `written` moves with it on purpose: the checks put this text in the box
   * and into the same updateDoc, so the field has nothing left of its own to
   * flush and must not send a second write behind them.
   */
  function replace(next: string) {
    setValue(next);
    state.current.typed = next;
    state.current.written = next;
  }

  return { value, change, flush, replace };
}

/**
 * A time, typed.
 *
 * The phone's own wheel rather than a text box, because there is exactly one
 * way to get a time wrong on a keyboard in the dark and this removes it. Used
 * for the two times on this sheet that are typed rather than stamped: a
 * clock-out being corrected, and a second trip being recorded after the fact.
 */
function TimeEditor({
  label,
  draft,
  onDraft,
  onSave,
  onCancel,
}: {
  label: string;
  draft: string;
  onDraft: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-arrived-line bg-arrived-soft p-3.5">
      <label
        htmlFor="clock-out"
        className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-arrived"
      >
        {label}
      </label>
      <input
        id="clock-out"
        type="time"
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        className="tnum mt-2 w-full rounded-lg border border-arrived-line bg-surface px-3 py-3 text-center font-mono text-[24px] font-bold text-ink outline-none focus:border-arrived"
      />
      <div className="mt-3 flex gap-2">
        <Button
          variant="arrived"
          size="lg"
          onClick={onSave}
          className="min-h-12 flex-1"
        >
          Save time
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={onCancel}
          className="min-h-12"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The second trip's time, which Karim types.
 *
 * Nothing on this panel is stamped, and that is the honest rendering of what it
 * is: he is writing down a van that came and went, often after it has gone. So
 * there is no Arrived to press and no Clock out to press — one control, holding
 * the one thing the row is missing.
 *
 * Until it is set the row counts as still out, which is deliberate. A half-
 * written second trip would otherwise sit on the sheet with a blank time and
 * reach the PDF that way, and End Day is the last moment anybody could have
 * noticed.
 */
function TripTimePanel({
  entry,
  editing,
  draft,
  onDraft,
  onStartEditing,
  onCancelEditing,
  onSaveTime,
}: {
  entry: Entry;
  editing: boolean;
  draft: string;
  onDraft: (next: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveTime: () => void;
}) {
  if (editing) {
    return (
      <TimeEditor
        label="In / out time"
        draft={draft}
        onDraft={onDraft}
        onSave={onSaveTime}
        onCancel={onCancelEditing}
      />
    );
  }

  const stamped = entry.clockOut;

  return (
    <button
      type="button"
      onClick={onStartEditing}
      className={`block w-full rounded-xl border px-4 py-4 text-center transition-colors active:brightness-[0.97] ${
        stamped
          ? "border-arrived-line bg-arrived-soft"
          : "border-brand-line bg-brand-soft"
      }`}
    >
      <span
        className={`block text-[11px] font-semibold uppercase tracking-[0.1em] ${
          stamped ? "text-arrived" : "text-brand"
        }`}
      >
        In / out time
      </span>
      <span
        className={`tnum mt-1 block font-mono text-[30px] font-bold leading-none tracking-tight ${
          stamped ? "text-arrived" : "text-brand"
        }`}
      >
        {stamped ? stationTimeLabel(stamped.toDate()) : "—:—"}
      </span>
      <span
        className={`mt-2 block text-[12px] font-medium ${
          stamped ? "text-arrived/80" : "text-brand/80"
        }`}
      >
        {stamped ? "Tap to correct" : "Tap to set it"}
      </span>
    </button>
  );
}

/**
 * What the sheet becomes once he is clocked out.
 *
 * The time is a button because it is the thing most likely to be wrong — the
 * handover ran on while Karim was pulled away and he tapped it four minutes
 * later. Correcting it should not need a menu.
 */
function ClockedOutPanel({
  entry,
  editing,
  draft,
  onDraft,
  onStartEditing,
  onCancelEditing,
  onSaveTime,
  onStamp,
  onReopen,
}: {
  entry: Entry;
  editing: boolean;
  draft: string;
  onDraft: (next: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveTime: () => void;
  onStamp: () => void;
  onReopen: () => void;
}) {
  const stamped = entry.clockOut;

  if (editing) {
    return (
      <TimeEditor
        label="Clocked out at"
        draft={draft}
        onDraft={onDraft}
        onSave={onSaveTime}
        onCancel={onCancelEditing}
      />
    );
  }

  return (
    <>
      {stamped ? (
        <button
          type="button"
          onClick={onStartEditing}
          className="block w-full rounded-xl border border-arrived-line bg-arrived-soft px-4 py-4 text-center"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-arrived">
            Clocked out
          </span>
          <span className="tnum mt-1 block font-mono text-[30px] font-bold leading-none tracking-tight text-arrived">
            {stationTimeLabel(stamped.toDate())}
          </span>
          <span className="mt-2 block text-[12px] font-medium text-arrived/80">
            Tap to correct
          </span>
        </button>
      ) : (
        /* Marked done from the laptop — the driver phoned his own time in.
           There is no stamp behind it, so it is labelled as what it is. */
        <div className="rounded-xl border border-line bg-sunken px-4 py-4 text-center">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Reported to dispatch
          </span>
          <span className="tnum mt-1 block font-mono text-[30px] font-bold leading-none tracking-tight text-ink">
            {entry.clockOutManual || "—"}
          </span>
          <span className="mt-2 block text-[12px] text-ink-muted">
            Not stamped here
          </span>
        </div>
      )}

      {stamped ? null : (
        <Button
          variant="arrived"
          size="lg"
          onClick={onStamp}
          className="min-h-14 w-full text-[17px]"
        >
          Stamp the time here
        </Button>
      )}

      <Button
        variant="ghost"
        size="lg"
        onClick={onReopen}
        className="min-h-12 w-full"
      >
        Put back on the list
      </Button>
    </>
  );
}
