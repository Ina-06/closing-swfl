import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { closedMarker } from "@/lib/fleetRound";
import { readTask, repairsFromEntries, unseenRepairs } from "@/lib/repairs";
import type { Entry } from "@/lib/types";

/**
 * End Day, done by the server, for a night nobody ended.
 *
 * The 7 AM rollover moves every screen on to the next night whether or not the
 * last one was closed, and until now a night that was not closed simply stayed
 * open for ever: its van issues never reached Repairs, the list of available
 * vans never emptied, and nothing was filed. This does what End Day does, in
 * the same order and by the same rules, and says it was the server that did it.
 *
 * Server-only: everything here is the Admin SDK, which is not subject to
 * firestore.rules. It writes exactly the fields End Day would have written,
 * plus `closedBy: "auto"` and a `missingClockOut` mark on drivers who were
 * never clocked out — and nothing else. No time is invented, no field another
 * role owns is touched, and nothing is deleted.
 *
 * The PDF is filed separately, by archiveSheet, once this has committed.
 */

/** Who the server writes as, in every `updatedBy` it stamps. */
export const SYSTEM = "system";

export type AutoCloseResult =
  | {
      closed: true;
      /** Van issues posted to the board — after de-duplication. */
      repairsPushed: number;
      /** Drivers marked as never clocked out. */
      missingClockOut: number;
      /** Whether the list of available vans and fuel cards was emptied. */
      fleetEnded: boolean;
    }
  | { closed: false; reason: string };

/**
 * An entry read raw off the server, with the three fields the repairs rules
 * call `.trim()` on made safe. A row written before one of them existed must
 * not throw halfway through closing a night.
 */
function entryOf(id: string, data: DocumentData): Entry {
  return {
    ...data,
    id,
    fullName: typeof data.fullName === "string" ? data.fullName : "",
    van: typeof data.van === "string" ? data.van : "",
    vanIssues: typeof data.vanIssues === "string" ? data.vanIssues : "",
  } as Entry;
}

/** No stamped time and no typed one: on the sheet, N/A. */
function neverClockedOut(data: DocumentData): boolean {
  const typed =
    typeof data.clockOutManual === "string" ? data.clockOutManual.trim() : "";
  return !data.clockOut && typed === "";
}

/**
 * Close one night, if it is still open, in a single transaction.
 *
 * One transaction because the close and everything that follows from it have to
 * happen together or not at all. The status is read inside it and checked
 * again, so if the closer presses End Day in the same instant, one of the two
 * wins outright: either this sees "closed" and does nothing, or End Day's write
 * is turned away by the rules (a closed night cannot be closed again). There is
 * no way to get two closes, or the van issues posted twice.
 *
 * `pushRepairs` is decided by the caller. It is true only for the night that
 * has just ended. An older night the server finds still open — a backlog from
 * before this job existed, or from a day it did not run — is closed and filed
 * but posts nothing: its faults are days old, some of them will have been
 * fixed since, and the board is a list of what needs doing now.
 *
 * The list of available vans and fuel cards is emptied only if the round is
 * still this night's. If the dispatcher has already posted tonight's roster,
 * the round belongs to tonight, and ending it would empty the list fleet has
 * just typed up for the evening. See fleetRound.
 *
 * `dryRun` does every read and every decision, and writes nothing.
 */
export async function autoCloseNight(
  nightKey: string,
  { pushRepairs, dryRun = false }: { pushRepairs: boolean; dryRun?: boolean },
): Promise<AutoCloseResult> {
  const db = getAdminDb();
  const sessionRef = db.collection("sessions").doc(nightKey);
  const roundRef = db.collection("fleetMeta").doc("round");
  const repairsCollection = db.collection("repairs");

  return db.runTransaction(async (transaction) => {
    const session = await transaction.get(sessionRef);
    if (!session.exists) return { closed: false, reason: "no such night" };
    if (session.data()?.status === "closed") {
      return { closed: false, reason: "already closed" };
    }

    // Every read before any write — Firestore transactions require it.
    const entries = await transaction.get(sessionRef.collection("entries"));
    // The same five hundred, newest first, that End Day reads. See pushRepairs.
    const board = pushRepairs
      ? await transaction.get(
          repairsCollection.orderBy("createdAt", "desc").limit(500),
        )
      : null;
    const round = await transaction.get(roundRef);

    const fresh = board
      ? unseenRepairs(
          repairsFromEntries(
            nightKey,
            entries.docs
              .slice()
              .sort((a, b) => (Number(a.data().seq) || 0) - (Number(b.data().seq) || 0))
              .map((doc) => entryOf(doc.id, doc.data())),
          ),
          board.docs.map((doc) => readTask(doc.data(), doc.id)),
        )
      : [];
    const missing = entries.docs.filter((doc) => neverClockedOut(doc.data()));
    const fleetEnded = round.data()?.night === nightKey;

    if (!dryRun) {
      transaction.update(sessionRef, {
        status: "closed",
        closedAt: FieldValue.serverTimestamp(),
        closedBy: "auto",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: SYSTEM,
      });

      // A mark, not a time. The time fields are left exactly as they were, so
      // a clock-out entered the next morning is still a clock-out, and Rebuild
      // prints it. This only records that, when the night was closed, there
      // was none.
      for (const doc of missing) {
        transaction.update(doc.ref, { missingClockOut: true });
      }

      // The same shape a task posted by End Day has, so the board cannot
      // tell them apart — they are the same thing, posted by a different hand.
      for (const task of fresh) {
        transaction.set(repairsCollection.doc(), {
          title: task.title,
          source: task.source,
          nightKey: task.nightKey,
          driverName: task.driverName,
          matchKey: task.matchKey,
          done: false,
          doneAt: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: SYSTEM,
        });
      }

      if (fleetEnded) {
        transaction.set(roundRef, {
          ...closedMarker(nightKey),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: SYSTEM,
        });
      }
    }

    return {
      closed: true,
      repairsPushed: fresh.length,
      missingClockOut: missing.length,
      fleetEnded,
    };
  });
}
