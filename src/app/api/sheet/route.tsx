import { fail, requireStaff } from "@/lib/server/auth";
import { renderSheet } from "@/lib/server/renderSheet";
import { mintPass, passIsGood } from "@/lib/sheetPass";

/**
 * The closing sheet, as the PDF that gets posted to the group.
 *
 * Either role can ask for it. The closer generates it at End Day and sends it to the
 * group; the dispatcher pulls the same night again from the archive weeks
 * later. This route renders it fresh from the entries every time — Rebuild, in
 * Past nights — and the copy filed at close lives in Storage, served by
 * /api/sheet/archived. Both are read-only operations
 * against a night that already exists, and there is nothing here that needs the
 * stricter of the two roles.
 *
 * Two ways in, same sheet. POST is the app asking, signed in, and gets the file
 * as a download. GET is a link being followed — the closer tapping View to read it
 * in Safari — and gets the same bytes marked to display rather than save. A
 * link cannot carry an Authorization header, so it carries a signed pass
 * instead; see lib/sheetPass.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
