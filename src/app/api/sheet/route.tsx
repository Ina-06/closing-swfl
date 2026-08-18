import { renderToBuffer } from "@react-pdf/renderer";
import { getAdminAuth, getAdminBucket, getAdminDb } from "@/lib/firebase/admin";
import { SheetDocument } from "@/lib/pdf/SheetDocument";
import { sheetRows } from "@/lib/sheet";
import type { Entry } from "@/lib/types";

/**
 * The closing sheet, as the PDF that gets posted to the group.
 *
 * Either role can ask for it. Karim generates it at End Day; the dispatcher
 * pulls it again from the archive, or rebuilds one from a night whose file
 * never made it to Storage. Both are read-only operations against a night that
 * already exists, so there is nothing here that needs the stricter of the two.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function requireStaff(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const role = decoded.role;
    return role === "dispatcher" || role === "closer" || role === "onetime"
      ? decoded
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const caller = await requireStaff(request);
  if (!caller) return fail("Sign in again and retry.", 403);

  let body: { nightKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Malformed request.", 400);
  }

  const nightKey = typeof body.nightKey === "string" ? body.nightKey : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nightKey)) return fail("Which night?", 400);

  const db = getAdminDb();
  const sessionRef = db.collection("sessions").doc(nightKey);

  let managedBy = "";
  let shift = "";
  let rows;
  try {
    const [session, entries] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("entries").orderBy("seq").get(),
    ]);

    if (!session.exists) return fail("There is no sheet for that night.", 404);

    const data = session.data() ?? {};
    managedBy = typeof data.managedBy === "string" ? data.managedBy : "";
    shift = typeof data.shift === "string" ? data.shift : "";
    rows = sheetRows(entries.docs.map((doc) => doc.data() as Entry));
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
        shift={shift}
        rows={rows}
      />,
    );
  } catch (error) {
    console.error("Could not render the PDF:", error);
    return fail("The sheet would not render. Nothing has been changed.", 500);
  }

  const filename = `closing-${nightKey}.pdf`;

  // Same bargain as the spreadsheet: the file in his hand is the deliverable,
  // the copy in Storage is the archive. One failing does not take the other.
  let saved = false;
  let archiveError = "";
  let bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "(not set)";
  try {
    const bucket = getAdminBucket();
    bucketName = bucket.name;
    const file = bucket.file(`sessions/${nightKey}/${filename}`);

    await file.save(buffer, {
      contentType: "application/pdf",
      metadata: { cacheControl: "private, max-age=0" },
    });

    // Signed, never public: full names, van issues and infractions, all of it.
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    await sessionRef.set({ pdfUrl: url }, { merge: true });
    saved = true;
  } catch (error) {
    console.error("Could not save the PDF to Storage:", error);
    archiveError = error instanceof Error ? error.message : String(error);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Sheet-Rows": String(rows.length),
      "X-Sheet-Archived": saved ? "1" : "0",
      "X-Sheet-Bucket": encodeURIComponent(bucketName),
      "X-Sheet-Archive-Error": encodeURIComponent(
        archiveError.replace(/\s+/g, " ").slice(0, 300),
      ),
    },
  });
}
