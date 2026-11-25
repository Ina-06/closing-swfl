import {
  FieldValue,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import { getAdminBucket, getAdminDb } from "@/lib/firebase/admin";
import { STATION_TIMEZONE } from "@/lib/constants";
import { renderSheet } from "@/lib/server/renderSheet";

/**
 * Filing a closed night's PDF in Storage.
 *
 * Past nights used to rebuild every sheet from the entries and keep nothing.
 * That is still there — it is Rebuild — but a rebuild is the night as it reads
 * now, and the thing people actually want back is the sheet as it was when the
 * night closed: the one that went to the group. So every close files one.
 *
 * Called from three places and safe from all of them at once:
 *   - /api/sheet/archive, straight after End Day, from the closer's phone;
 *   - the 7 AM job, for a night it has just closed itself;
 *   - the same job's backfill, for any close whose copy never made it — End
 *     Day in a yard with no signal is the usual reason.
 *
 * Server-only: it reads and writes with the Admin SDK. Nothing here deletes or
 * overwrites a file, and a night's earlier copies are kept when a new one is
 * filed.
 */

/** Two Firestore timestamps, or two absences of one, that are the same. */
function sameStamp(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Timestamp && b instanceof Timestamp) return a.isEqual(b);
  return false;
}

/**
 * Whether this night's latest close still needs its PDF filed.
 *
 * Closed, and the filed copy — if there is one — was filed for a different
 * close. Comparing the close it was filed for, rather than asking whether any
 * copy exists, is what makes a reopened night that is closed again file a
 * second version, and makes every other call a no-op.
 */
export function needsArchive(data: DocumentData | undefined): boolean {
  if (!data || data.status !== "closed") return false;
  const filed = data.archivedPdf;
  if (!filed || typeof filed.path !== "string" || filed.path === "") {
    return true;
  }
  return !sameStamp(filed.closedAt ?? null, data.closedAt ?? null);
}

/** `20261125-0705`, in station time, for the file name. */
function stationStamp(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "00";
  return `${part("year")}${part("month")}${part("day")}-${part("hour")}${part("minute")}`;
}

/** The status Cloud Storage answers with when a precondition fails. */
function alreadyThere(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 412
  );
}

export type ArchiveResult =
  | { archived: true; path: string; rows: number }
  | { archived: false; reason: string };

/**
 * File the PDF for this night's latest close, if it has not been filed yet.
 *
 * In four steps, and the order matters:
 *
 *   1. Ask whether anything needs doing. Almost always nothing does, and that
 *      answer costs one read.
 *   2. Render, from the same renderSheet the share button uses.
 *   3. Upload with `ifGenerationMatch: 0` — "only if there is no such file" —
 *      so a name already in the bucket is never written over. Two closes in
 *      the same minute get `-2`, `-3` on the end rather than one replacing the
 *      other.
 *   4. Record it, in a transaction that checks again. If the night was
 *      reopened while this was rendering, or somebody else filed this close
 *      first, the record is left alone. The uploaded file stays where it is —
 *      nothing here deletes — and simply is not pointed at.
 *
 * `dryRun` stops after step 1 and says what would have happened.
 */
export async function archiveSheet(
  nightKey: string,
  { by, auto, dryRun = false }: { by: string; auto: boolean; dryRun?: boolean },
): Promise<ArchiveResult> {
  const sessionRef = getAdminDb().collection("sessions").doc(nightKey);

  const before = await sessionRef.get();
  if (!before.exists) return { archived: false, reason: "no such night" };
  const data = before.data();
  if (!needsArchive(data)) {
    return {
      archived: false,
      reason: data?.status === "closed" ? "already filed" : "not closed",
    };
  }
  if (dryRun) return { archived: false, reason: "dry run: would file" };

  // The close this copy is for. Carried through to the record so the check
  // in step 4 — and every later call — can tell which close has its copy.
  const closedAt: Timestamp | null =
    data?.closedAt instanceof Timestamp ? data.closedAt : null;

  const sheet = await renderSheet(nightKey);
  if (sheet instanceof Response) {
    const body = (await sheet.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `The sheet would not render (${sheet.status}).`);
  }

  const bucket = getAdminBucket();
  const base = `sheets/${nightKey}/closing-${nightKey}-${stationStamp(new Date())}`;
  let path = "";
  for (let attempt = 1; attempt <= 5 && path === ""; attempt += 1) {
    const candidate = attempt === 1 ? `${base}.pdf` : `${base}-${attempt}.pdf`;
    try {
      await bucket.file(candidate).save(Buffer.from(sheet.bytes), {
        resumable: false,
        contentType: "application/pdf",
        metadata: { cacheControl: "private, no-store" },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      path = candidate;
    } catch (error) {
      if (!alreadyThere(error)) throw error;
    }
  }
  if (path === "") throw new Error("Five files with that name already exist.");

  const record = {
    path,
    // Not a server timestamp: those cannot go inside an array, and this one
    // goes into pdfVersions. The server's own clock is close enough for a
    // line that says what time the copy was filed.
    at: Timestamp.now(),
    by,
    auto,
    rows: sheet.rows,
    closedAt,
  };

  const recorded = await getAdminDb().runTransaction(async (transaction) => {
    const fresh = (await transaction.get(sessionRef)).data();
    if (!needsArchive(fresh)) return false;
    if (!sameStamp(fresh?.closedAt ?? null, closedAt)) return false;

    // Only these two fields. updatedAt and updatedBy belong to whoever last
    // changed the night, and filing a copy of it is not a change to it.
    transaction.update(sessionRef, {
      archivedPdf: record,
      pdfVersions: FieldValue.arrayUnion(record),
    });
    return true;
  });

  if (!recorded) {
    console.warn(
      `Filed ${path} but did not record it: the night changed, or another copy was filed first.`,
    );
    return { archived: false, reason: "another copy was filed first" };
  }

  return { archived: true, path, rows: sheet.rows };
}
