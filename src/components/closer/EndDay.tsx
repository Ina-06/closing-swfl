"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { ErrorNote, SoftWarning } from "@/components/ui/Field";
import { postAuthed, shareOrSave } from "@/lib/api";
import { closeSession } from "@/lib/db/sessions";
import { stationDateLabel } from "@/lib/constants";
import type { Entry, Session } from "@/lib/types";

/**
 * End Day — the last thing Karim does before he goes home.
 *
 * There is no button at all until every driver on the sheet is clocked out.
 * Not a warning, not an override: a night is not over while a van is out, and
 * a closer signing off on one that is not finished is not a thing the app
 * should make possible.
 *
 * That is not a dead end. A driver who genuinely is not coming back to the
 * yard gets clocked out by the dispatcher from their side, which is the right
 * place for that call to be made — it is a decision about the night, not about
 * the yard.
 */
export function EndDay({
  nightKey,
  session,
  entries,
  outstanding,
  pending,
  uid,
}: {
  nightKey: string;
  session: Session;
  entries: Entry[];
  /**
   * Drivers on the sheet not yet clocked out, whether they are still on the
   * road or standing at the van. Any at all hides this whole panel.
   */
  outstanding: number;
  /** On the roster but never entered by dispatch — a note, not a blocker. */
  pending: number;
  uid: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /**
   * Tonight's PDF, rendered and kept before he ever reaches for Share.
   *
   * Building it inside the tap spends the user gesture on a network round trip
   * and a server-side render, and by then iOS has stopped counting the tap as
   * user-initiated — see shareOrSave. The file has to be in hand first.
   */
  const [sheet, setSheet] = useState<Blob | null>(null);
  /** The link that opens the same sheet in the browser's own PDF viewer. */
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const asked = useRef(false);
  /** The build already running, so a tap during one joins it, never doubles it. */
  const inflight = useRef<Promise<Blob> | null>(null);

  const closed = session.status === "closed";
  const filename = `closing-${nightKey}.pdf`;
  const everyoneIn = outstanding === 0 && entries.length > 0;
  const dateLabel = stationDateLabel(new Date(`${nightKey}T12:00:00Z`));

  /**
   * Render tonight's sheet and hold on to it.
   *
   * Nothing is filed anywhere on the way past — the PDF goes to the group chat,
   * which is where anyone actually looks for it. Any night can be rendered
   * again from its entries under Past nights, so there is nothing here that
   * only exists once.
   *
   * The View link rides back on the same response. One round trip gets both,
   * and both are in hand before either button is touched.
   */
  const prepare = useCallback(() => {
    if (!inflight.current) {
      inflight.current = (async () => {
        try {
          const response = await postAuthed("/api/sheet", { nightKey });
          const link = response.headers.get("X-Sheet-Link");
          const blob = await response.blob();
          setSheet(blob);
          if (link) setViewUrl(link);
          return blob;
        } finally {
          inflight.current = null;
        }
      })();
    }
    return inflight.current;
  }, [nightKey]);

  /**
   * Start building the moment the night is closed, however it got closed.
   *
   * Usually that is End Day on this phone, but the dispatcher can close a night
   * from their end, and Karim can come back to a closed one after a reload. All
   * three land on a pair of buttons with the file already behind them.
   *
   * A failure here is swallowed on purpose. He has not asked for anything yet,
   * the buttons below work either way, and they will say what went wrong if and
   * when he presses one. What must never happen is this quietly disabling them.
   */
  useEffect(() => {
    if (!closed || asked.current) return;
    asked.current = true;
    setBuilding(true);
    prepare()
      .catch(() => {})
      .finally(() => setBuilding(false));
  }, [closed, prepare]);

  async function end() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // Closed first, so the dispatcher's screen says so immediately. The
      // listener flips `closed`, which is what starts the sheet building.
      await closeSession(nightKey, uid);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Nothing to hand over yet. Build it, and say which button to press next.
   *
   * This half is allowed to hold the buttons, because it is bounded: every
   * request under postAuthed has forty-five seconds and then gives up with a
   * reason. The sending half below is not, and must never be.
   */
  async function buildFirst(next: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await prepare();
      setNote(`Sheet ready. Tap ${next} again.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the sheet.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * The tap. It always does something, and it always says so.
   *
   * With the sheet in hand it sends it, and nothing at all is awaited before
   * shareOrSave — not a fetch, not a token — because the gesture has to still
   * be his when the share sheet is asked for. Without it, this tap builds it
   * and the next one sends it.
   *
   * The sending half deliberately does not set `busy`. A share promise that
   * never settles would leave this button un-pressable for the rest of the
   * night, and the button being pressable matters more than guarding against a
   * double tap — the share sheet is its own answer to that, because it covers
   * the screen.
   *
   * Every branch below ends in something visible. A tap that changes nothing on
   * screen is indistinguishable from a broken button, and that is exactly what
   * this was: a share that never opened came back as AbortError, went down the
   * "he cancelled" path, and said nothing at all.
   */
  async function share() {
    if (!sheet) return buildFirst("Share");

    setError(null);
    setNote(null);
    try {
      const how = await shareOrSave(
        sheet,
        filename,
        `Closing sheet — ${dateLabel}`,
      );
      if (how === "shared") setNote("Sent.");
      if (how === "saved") {
        setNote("Saved to this device. Send it on from your files.");
      }
      if (how === "cancelled") setNote("Not sent — you closed the share sheet.");
      if (how === "failed") {
        setError(
          "The phone would not open the share sheet. Press View instead — the sheet opens in the browser, and you can send it from the share button there.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share that.");
    }
  }

  if (closed) {
    return (
      <section className="mt-4 rounded-xl border border-arrived-line bg-arrived-soft px-4 py-4">
        <h2 className="text-[15px] font-bold text-arrived">Night closed</h2>
        <p className="mt-0.5 text-[13px] text-arrived/80">
          Send the sheet to the group.
        </p>

        {/* Two ways out, because one of them keeps failing on his phone and a
            closer standing in the yard at midnight needs the other one right
            there rather than described to him over the phone.

            View is deliberately a link and not a button. Following a link to a
            PDF is the one thing every phone does the same way: it opens the
            reader, and the reader has a share button of the phone's own. Being
            a real href also means the browser navigates on the tap itself, with
            nothing of ours running first to spend the gesture. */}
        <div className="mt-3 flex gap-2">
          {viewUrl ? (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setError(null);
                setNote("Opening the sheet. Send it from the share button there.");
              }}
              className={buttonClass(
                "secondary",
                "lg",
                "min-h-14 flex-1 text-[16px]",
              )}
            >
              View
            </a>
          ) : (
            <Button
              variant="secondary"
              size="lg"
              loading={busy}
              onClick={() => void buildFirst("View")}
              className="min-h-14 flex-1 text-[16px]"
            >
              View
            </Button>
          )}

          {/* Never disabled by work he cannot see. It is the last thing he does
              all night and it has to answer a press every time — what is behind
              it changes, what it does when pressed does not. */}
          <Button
            variant="arrived"
            size="lg"
            loading={busy && !sheet}
            onClick={() => void share()}
            className="min-h-14 flex-1 text-[16px]"
          >
            Share
          </Button>
        </div>

        {building && !sheet ? (
          <p className="mt-2 text-center text-[12px] text-arrived/80">
            Getting the sheet ready&hellip;
          </p>
        ) : null}

        {note ? (
          <p className="mt-2 text-center text-[12px] text-arrived/80">{note}</p>
        ) : null}
        {error ? (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}

        <HowThisPhoneOpens />
      </section>
    );
  }

  /**
   * Nothing to show yet.
   *
   * A closer with a van still out, or one still open in front of him, has no
   * decision to make here, so he is not given one — the counter at the top of
   * his screen is already telling him what is left, and a disabled button
   * underneath it would only be a second way of saying the same thing.
   */
  if (!everyoneIn) return null;

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface px-4 py-4">
      <h2 className="text-[15px] font-bold tracking-tight">End day</h2>
      <p className="mt-0.5 text-[13px] text-ink-muted">
        Everyone is in. This closes the night and builds the sheet.
      </p>

      {/* On the roster but never entered by dispatch. Not a reason to stop him
          — they were never his to clock out — but he should know before the
          sheet goes up without them. */}
      {pending > 0 ? (
        <div className="mt-3">
          <SoftWarning>
            {pending} {pending === 1 ? "driver is" : "drivers are"} on tonight&rsquo;s
            roster but never made it onto the sheet. They will not be on the
            PDF.
          </SoftWarning>
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        {confirming ? (
          <>
            <Button
              variant="arrived"
              size="lg"
              loading={busy}
              onClick={() => void end()}
              className="min-h-14 flex-1 text-[16px]"
            >
              Close the night
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="min-h-14"
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="arrived"
            size="lg"
            onClick={() => setConfirming(true)}
            className="min-h-14 w-full text-[16px]"
          >
            End day
          </Button>
        )}
      </div>

      {note ? (
        <p className="mt-2 text-center text-[12px] text-ink-muted">{note}</p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
    </section>
  );
}

/**
 * What this particular phone actually is, in six words.
 *
 * Three nights have gone into guessing at two things the phone knows about
 * itself and we do not: whether the app is running from a Home Screen icon —
 * which has no address bar, no reload, and no share button of its own — and
 * whether iOS is willing to hand files to the share sheet at all. One property
 * each, and neither has ever been on screen where it could be read back over
 * the phone.
 *
 * It sits under the buttons and only on a closed night: in front of exactly the
 * person who can answer the question, and never in the way of the work.
 */
function HowThisPhoneOpens() {
  /**
   * Read through useSyncExternalStore rather than an effect, because this is a
   * browser fact and the server has no answer for it. The server snapshot is
   * null, so the markup React sends and the markup it hydrates agree, and the
   * line appears on the pass after that.
   */
  const how = useSyncExternalStore(neverChanges, phoneReport, () => null);

  if (!how) return null;

  return (
    <p className="mt-3 text-center font-mono text-[11px] tracking-wide text-arrived/60">
      {how}
    </p>
  );
}

/** Nothing here ever changes while the app is open. */
function neverChanges() {
  return () => {};
}

/** Worked out once and kept, because the snapshot has to be the same string
 *  every time it is asked for or React will re-render forever. */
let report: string | null = null;

function phoneReport(): string {
  if (report !== null) return report;

  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  // A stand-in file, because canShare answers on the kind of thing offered
  // rather than its contents — and this has to be answerable before any sheet
  // has been built.
  let files = false;
  try {
    const probe = new File([new Blob(["."])], "sheet.pdf", {
      type: "application/pdf",
    });
    files = navigator.canShare?.({ files: [probe] }) === true;
  } catch {
    files = false;
  }

  report = `${standalone ? "home screen" : "browser"} · share sheet ${
    files ? "yes" : "no"
  }`;
  return report;
}
