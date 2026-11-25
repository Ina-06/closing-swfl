import QRCode from "qrcode";
import { getAdminBucket } from "@/lib/firebase/admin";
import { isDocId } from "@/lib/regDocs";
import {
  REG_HEADERS,
  allowView,
  clientIp,
  pinCookieOf,
  pinCookieOk,
  regFail,
  viewTokenOk,
} from "@/lib/server/regAccess";
import { ownQrPath, ownRegPath, readDocs, vanRef } from "@/lib/server/regStore";
import { isVanId } from "@/lib/vanQr";

/**
 * GET /api/reg/doc/{vanId}/{docId} — one document's bytes, for the driver's
 * viewer. `docId` is "qr" for the van's QR code.
 *
 * The bytes come through here rather than on a signed Storage URL, so there
 * is never a link to the file that could be opened, saved or forwarded. What
 * it takes:
 *
 *   - the PIN cookie, when DRIVER_PIN is set;
 *   - the ten-minute token the search handed out for exactly this document,
 *     in the X-Reg-Token header — after ten minutes, search again;
 *   - X-Reg-View: 1, which only the page's own fetch sends. Pasting the
 *     address into a browser sends neither header and gets nothing.
 *
 * The van must still be with us, and the document still the active one.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ vanId: string; docId: string }> },
) {
  const { vanId, docId } = await params;
  if (!isVanId(vanId) || !(docId === "qr" || isDocId(docId))) return regFail("Not found.", 404);

  if (request.headers.get("x-reg-view") !== "1") return regFail("Open this from the search page.", 400);
  if (!pinCookieOk(pinCookieOf(request))) return regFail("Enter the driver PIN first.", 401, { pin: true });

  const token = viewTokenOk(request.headers.get("x-reg-token"), vanId, docId);
  if (token === "expired") return regFail("This has timed out. Search for the van again.", 410);
  if (token === "bad") return regFail("Search for the van again.", 403);

  try {
    if (!(await allowView(clientIp(request)))) {
      return regFail("Too many requests. Wait a minute and try again.", 429);
    }
  } catch (error) {
    console.error("Could not count a view:", error);
    return regFail("Something went wrong. Try again in a moment.", 500);
  }

  let snapshot;
  try {
    snapshot = await vanRef(vanId).get();
  } catch (error) {
    console.error("Could not read the van:", error);
    return regFail("Something went wrong. Try again in a moment.", 500);
  }
  if (!snapshot.exists || snapshot.get("active") === false) return regFail("Not found.", 404);

  const headers = {
    ...REG_HEADERS,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  };

  if (docId === "qr") {
    // A crisp code drawn from the text when it was read on upload; the uploaded picture otherwise.
    const text = snapshot.get("qrText");
    if (typeof text === "string" && text) {
      try {
        const png = await QRCode.toBuffer(text, { width: 1024, margin: 4, errorCorrectionLevel: "M" });
        return new Response(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
      } catch {
        // Too long to draw — fall through to the uploaded image.
      }
    }
    const path = ownQrPath(vanId, snapshot.get("qrPath"));
    if (!path) return regFail("This van has no QR code.", 404);
    return stream(path, null, headers);
  }

  const doc = readDocs(snapshot.get("registrationDocs")).find((entry) => entry.id === docId);
  const path = doc && doc.active === true ? ownRegPath(vanId, doc.storagePath) : null;
  if (!doc || !path) return regFail("This registration has been replaced. Search for the van again.", 404);
  return stream(path, typeof doc.contentType === "string" ? doc.contentType : null, headers);
}

async function stream(path: string, contentType: string | null, headers: Record<string, string>) {
  try {
    const file = getAdminBucket().file(path);
    const [buffer] = await file.download();
    let type = contentType;
    if (!type) {
      const [metadata] = await file.getMetadata();
      type = typeof metadata.contentType === "string" ? metadata.contentType : "application/octet-stream";
    }
    return new Response(new Uint8Array(buffer), { headers: { ...headers, "Content-Type": type } });
  } catch (error) {
    console.error(`Could not read ${path}:`, error);
    return regFail("The document could not be fetched. Try again.", 502);
  }
}
