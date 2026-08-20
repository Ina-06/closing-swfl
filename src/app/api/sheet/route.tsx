import { renderToBuffer } from "@react-pdf/renderer";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { SheetDocument } from "@/lib/pdf/SheetDocument";
import { sheetRows } from "@/lib/sheet";
import type { Entry } from "@/lib/types";

/**
 * The closing sheet, as the PDF that gets posted to the group.
 *
 * Either role can ask for it. Karim generates it at End Day and sends it to the
 * group; the dispatcher pulls the same night again from the archive weeks
 * later. It is rendered fresh from the entries every time — the entries are the
 * record, the PDF is only a view of them — so both are read-only operations
 * against a night that already exists, and there is nothing here that needs the
 * stricter of the two roles.
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
  let rows;
  try {
    const [session, entries] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("entries").orderBy("seq").get(),
    ]);

    if (!session.exists) return fail("There is no sheet for that night.", 404);

    const data = session.data() ?? {};
    managedBy = typeof data.managedBy === "string" ? data.managedBy : "";
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
        rows={rows}
      />,
    );
  } catch (error) {
    console.error("Could not render the PDF:", error);
    return fail("The sheet would not render. Nothing has been changed.", 500);
  }

  const filename = `closing-${nightKey}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Sheet-Rows": String(rows.length),
    },
  });
}
