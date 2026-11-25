import { getAdminBucket, getAdminDb } from "@/lib/firebase/admin";
import { fail, nightKeyOf, requireStaff } from "@/lib/server/auth";
import { mintPass, passIsGood } from "@/lib/sheetPass";

/**
 * A night's filed PDF — the copy made when it closed — out of Storage.
 *
 * The same two doors as /api/sheet, for the same reasons. POST is the app
 * asking, signed in, and gets the file as a download. GET is the View link,
 * carrying a signed pass instead of a header, and gets the same bytes marked
 * to open in the browser's own PDF viewer.
 *
 * The bytes are read with the Admin SDK and handed back from here. There is no
 * public URL and no signed Storage URL: storage.rules denies every client, and
 * the only way to a filed sheet is through the same checks as a rebuilt one.
 *
 * `path` picks an older version. It has to be one the night itself lists in
 * pdfVersions — a path is not something to accept from a caller and go and
 * fetch, even from inside our own bucket. Without one, the latest is served.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Found = { bytes: Uint8Array<ArrayBuffer>; filename: string; path: string };

async function readFiled(
  nightKey: string,
  wanted: string,
): Promise<Found | Response> {
  let path = "";
  try {
    const session = await getAdminDb().collection("sessions").doc(nightKey).get();
    if (!session.exists) return fail("There is no sheet for that night.", 404);

    const data = session.data() ?? {};
    const versions: string[] = Array.isArray(data.pdfVersions)
      ? data.pdfVersions
          .map((version: { path?: unknown }) => version?.path)
          .filter((value: unknown): value is string => typeof value === "string")
      : [];
    const latest =
      typeof data.archivedPdf?.path === "string" ? data.archivedPdf.path : "";

    if (wanted) {
      if (!versions.includes(wanted) && wanted !== latest) {
        return fail("That is not one of this night's sheets.", 400);
      }
      path = wanted;
    } else {
      path = latest;
    }
    if (!path) return fail("This night has no filed sheet yet. Use Rebuild.", 404);
  } catch (error) {
    console.error("Could not read the night:", error);
    return fail("Could not read that night.", 500);
  }

  try {
    const [buffer] = await getAdminBucket().file(path).download();
    return {
      bytes: new Uint8Array(buffer),
      filename: path.split("/").pop() ?? `closing-${nightKey}.pdf`,
      path,
    };
  } catch (error) {
    console.error(`Could not fetch ${path}:`, error);
    return fail("The filed sheet could not be fetched. Use Rebuild.", 502);
  }
}

/** The View link for a filed sheet. See viewLink in /api/sheet. */
function viewLink(nightKey: string, path: string): string | null {
  try {
    return `/api/sheet/archived?n=${nightKey}&t=${mintPass(nightKey)}&p=${encodeURIComponent(path)}`;
  } catch (error) {
    console.error("Could not mint a view pass:", error);
    return null;
  }
}

export async function POST(request: Request) {
  const caller = await requireStaff(request);
  if (!caller) return fail("Sign in again and retry.", 403);

  let body: { nightKey?: unknown; path?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Malformed request.", 400);
  }

  const nightKey = nightKeyOf(body.nightKey);
  if (!nightKey) return fail("Which night?", 400);
  const wanted = typeof body.path === "string" ? body.path : "";

  const found = await readFiled(nightKey, wanted);
  if (found instanceof Response) return found;

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${found.filename}"`,
    "Cache-Control": "no-store",
  });
  const link = viewLink(nightKey, found.path);
  if (link) headers.set("X-Sheet-Link", link);

  return new Response(found.bytes, { headers });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const nightKey = nightKeyOf(query.get("n"));
  const pass = query.get("t") ?? "";

  if (!nightKey) return fail("Which night?", 400);
  if (!passIsGood(nightKey, pass)) {
    return fail(
      "That link has expired. Open the app and press View again.",
      403,
    );
  }

  const found = await readFiled(nightKey, query.get("p") ?? "");
  if (found instanceof Response) return found;

  return new Response(found.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${found.filename}"`,
      "Cache-Control": "no-store",
      // The pass is in the URL of this page. Nothing here should carry it on.
      "Referrer-Policy": "no-referrer",
    },
  });
}
