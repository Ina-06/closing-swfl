import { renderToBuffer } from "@react-pdf/renderer";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { SheetDocument } from "@/lib/pdf/SheetDocument";
import { sheetRows } from "@/lib/sheet";
import { mintPass, passIsGood } from "@/lib/sheetPass";
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
 *
 * Two ways in, same sheet. POST is the app asking, signed in, and gets the file
 * as a download. GET is a link being followed — Karim tapping View to read it
 * in Safari — and gets the same bytes marked to display rather than save. A
 * link cannot carry an Authorization header, so it carries a signed pass
 * instead; see lib/sheetPass.
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

type Sheet = { bytes: Uint8Array<ArrayBuffer>; filename: string; rows: number };

/**
 * Read the night and draw it.
 *
 * Returns either the finished file or the Response explaining why there isn't
 * one, so both handlers report the same failures in the same words.
 */
async function renderSheet(nightKey: string): Promise<Sheet | Response> {
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
      <SheetDocument nightKey={nightKey} managedBy={managedBy} rows={rows} />,
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

/**
 * The link that opens this night in the browser's own PDF viewer.
 *
 * Handed back on the POST that builds the sheet, so the app has it in hand
 * before anyone taps anything — a link has to exist to be a link, and minting
 * one inside the tap is the mistake that broke Share.
 *
 * A missing signing secret costs the View button and nothing else. The sheet
 * itself is already rendered by the time this is called and the download works
 * regardless, so this refuses to be the thing that fails the night.
 */
function viewLink(nightKey: string): string | null {
  try {
    return `/api/sheet?n=${nightKey}&t=${mintPass(nightKey)}`;
  } catch (error) {
    console.error("Could not mint a view pass:", error);
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

  const sheet = await renderSheet(nightKey);
  if (sheet instanceof Response) return sheet;

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${sheet.filename}"`,
    "Cache-Control": "no-store",
    "X-Sheet-Rows": String(sheet.rows),
  });

  const link = viewLink(nightKey);
  if (link) headers.set("X-Sheet-Link", link);

  return new Response(sheet.bytes, { headers });
}

/**
 * Someone followed the View link.
 *
 * `inline` is the whole point of this handler existing: it is what makes Safari
 * open its PDF viewer instead of dropping a file somewhere, and that viewer has
 * a share button of the phone's own — the fallback for the nights our share
 * button will not open.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const nightKey = query.get("n") ?? "";
  const pass = query.get("t") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(nightKey)) return fail("Which night?", 400);
  if (!passIsGood(nightKey, pass)) {
    return fail(
      "That link has expired. Open the app and press View again.",
      403,
    );
  }

  const sheet = await renderSheet(nightKey);
  if (sheet instanceof Response) return sheet;

  return new Response(sheet.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${sheet.filename}"`,
      "Cache-Control": "no-store",
      // The pass is in the URL of this page. Nothing here should carry it on to
      // anywhere else.
      "Referrer-Policy": "no-referrer",
    },
  });
}
