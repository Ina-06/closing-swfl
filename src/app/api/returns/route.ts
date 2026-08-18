import ExcelJS from "exceljs";
import { getAdminAuth, getAdminDb, getAdminBucket } from "@/lib/firebase/admin";
import { stationDateLabel } from "@/lib/constants";
import { returnsRows, type ReturnsRow } from "@/lib/returnsReport";
import type { Entry } from "@/lib/types";

/**
 * The returns spreadsheet.
 *
 * Built on the server for two reasons: the workbook library has no business in
 * a phone's bundle, and the Admin SDK can read the night's entries without the
 * caller having to be trusted with a query. The caller still has to prove who
 * they are — the id token is verified here and the role claim checked, exactly
 * as firestore.rules would.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Whoever is asking, and whether they are allowed to. */
async function requireDispatcher(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.role === "dispatcher" ? decoded : null;
  } catch {
    return null;
  }
}

function buildWorkbook(nightKey: string, rows: ReturnsRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Closing — SWFL";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Returns", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  // The date on its own line: this file gets opened weeks later, out of a
  // folder of files with very similar names.
  const title = sheet.addRow([
    `Returns — ${stationDateLabel(new Date(`${nightKey}T12:00:00Z`))}`,
  ]);
  title.font = { bold: true, size: 13 };
  sheet.mergeCells(1, 1, 1, 3);

  const header = sheet.addRow(["DA Name", "Returns", "Reason"]);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE9EEFE" },
    };
    cell.border = { bottom: { style: "thin", color: { argb: "FFC2D0FB" } } };
  });

  for (const row of rows) {
    sheet.addRow([row.name, row.count, row.reason]);
  }

  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 10;
  sheet.getColumn(2).alignment = { horizontal: "center" };
  sheet.getColumn(3).width = 60;
  sheet.getColumn(3).alignment = { wrapText: true, vertical: "top" };

  return workbook;
}

export async function POST(request: Request) {
  const caller = await requireDispatcher(request);
  if (!caller) return fail("Only the dispatcher can build this file.", 403);

  let body: { nightKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Malformed request.", 400);
  }

  const nightKey = typeof body.nightKey === "string" ? body.nightKey : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nightKey)) {
    return fail("Which night?", 400);
  }

  let rows: ReturnsRow[];
  try {
    const snapshot = await getAdminDb()
      .collection("sessions")
      .doc(nightKey)
      .collection("entries")
      .orderBy("seq")
      .get();

    rows = returnsRows(
      snapshot.docs.map((document) => document.data() as Entry),
    );
  } catch (error) {
    console.error("Could not read the night's entries:", error);
    return fail("Could not read tonight's sheet.", 500);
  }

  const buffer = Buffer.from(
    await buildWorkbook(nightKey, rows).xlsx.writeBuffer(),
  );
  const filename = `returns-${nightKey}.xlsx`;

  /**
   * Storage is best effort, and deliberately so.
   *
   * The file in the dispatcher's hands is the thing that was asked for; the
   * copy in Storage is for the archive. If the bucket is not switched on yet,
   * that is not a reason to send them away empty-handed — it is a reason to
   * say so on the screen, which is what the header below is for.
   */
  let saved = false;
  let archiveError = "";
  let bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "(not set)";
  try {
    const bucket = getAdminBucket();
    bucketName = bucket.name;
    const path = `sessions/${nightKey}/${filename}`;
    const file = bucket.file(path);
    await file.save(buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      metadata: { cacheControl: "private, max-age=0" },
    });

    // Signed rather than public: this file has every driver's full name in it.
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    await getAdminDb()
      .collection("sessions")
      .doc(nightKey)
      .set({ returnsXlsxUrl: url }, { merge: true });

    saved = true;
  } catch (error) {
    console.error("Could not save the spreadsheet to Storage:", error);
    archiveError = error instanceof Error ? error.message : String(error);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      /* Read by the dispatcher's screen so it can report what actually
         happened rather than assuming it worked. Encoded and capped because a
         header has to be short, single-line ASCII — the full text is in the
         server log either way. Only the dispatcher can reach this route. */
      "X-Returns-Rows": String(rows.length),
      "X-Returns-Archived": saved ? "1" : "0",
      "X-Returns-Bucket": encodeURIComponent(bucketName),
      "X-Returns-Archive-Error": encodeURIComponent(
        archiveError.replace(/\s+/g, " ").slice(0, 300),
      ),
    },
  });
}
