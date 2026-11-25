import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { SheetDocument } from "@/lib/pdf/SheetDocument";
import { sheetRows } from "@/lib/sheet";
import { stationTimeLabel } from "@/lib/constants";
import { fail } from "@/lib/server/auth";
import type { Entry, RosterEntry } from "@/lib/types";

/**
 * A night's sheet, drawn — the one place that does it.
 *
 * Moved out of the sheet route so that the PDF the closer shares, the copy
 * filed in Storage and the copy the 7 AM job files are the same drawing of the
 * same data. Three renderers would be three sheets that drift; one is a sheet.
 *
 * Server-only: it reads with the Admin SDK.
 */

export type Sheet = {
  bytes: Uint8Array<ArrayBuffer>;
  filename: string;
  rows: number;
};

/**
 * The roster off a raw session document, read the same way toSession reads
 * it on the client: every field defaulted, nothing trusted. This is fed raw
 * from Firestore, and a roster line missing a name must not take the sheet
 * down with it.
 */
function rosterOf(data: DocumentData): RosterEntry[] {
  if (!Array.isArray(data.roster)) return [];
  return data.roster.map((row: DocumentData) => ({
    driverId: String(row?.driverId ?? ""),
    fullName: String(row?.fullName ?? ""),
    isBud: row?.isBud === true,
    isTrainer: row?.isTrainer === true,
    isRescuer: row?.isRescuer === true,
  }));
}

/**
 * Read the night and draw it.
 *
 * Returns either the finished file or the Response explaining why there isn't
 * one, so every caller reports the same failures in the same words.
 *
 * The status is read here rather than passed in, so the sheet always matches
 * the night as it stands: closed means N/A in the empty time cells and the
 * drivers who were never entered at the bottom; open means neither.
 */
export async function renderSheet(nightKey: string): Promise<Sheet | Response> {
  const db = getAdminDb();
  const sessionRef = db.collection("sessions").doc(nightKey);

  let managedBy = "";
  let autoClosedAt: string | null = null;
  let rows;
  try {
    const [session, entries] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("entries").orderBy("seq").get(),
    ]);

    if (!session.exists) return fail("There is no sheet for that night.", 404);

    const data = session.data() ?? {};
    managedBy = typeof data.managedBy === "string" ? data.managedBy : "";
    const closed = data.status === "closed";

    // Only on a night the server closed. A closedAt that has not been stamped
    // is not a time anybody can print, so the line goes without one rather
    // than claiming a moment that never happened.
    if (closed && data.closedBy === "auto") {
      const at = data.closedAt?.toDate?.();
      autoClosedAt = at instanceof Date ? stationTimeLabel(at) : "7 AM";
    }

    rows = sheetRows(
      entries.docs.map((doc) => doc.data() as Entry),
      { closed, roster: rosterOf(data) },
    );
  } catch (error) {
    console.error("Could not read the night:", error);
    return fail("Could not read that night's sheet.", 500);
  }

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(
      <SheetDocument
        nightKey={nightKey}
        managedBy={managedBy}
        rows={rows}
        autoClosedAt={autoClosedAt}
      />,
    );
  } catch (error) {
    console.error("Could not render the PDF:", error);
    return fail("The sheet would not render. Nothing has been changed.", 500);
  }

  return {
    bytes: new Uint8Array(buffer),
    filename: `closing-${nightKey}.pdf`,
    rows: rows.length,
  };
}
