import { FieldValue } from "firebase-admin/firestore";
import { getAdminBucket, getAdminDb } from "@/lib/firebase/admin";
import { fail, requireRole } from "@/lib/server/auth";
import {
  EXTENSION,
  QR_TEXT_MAX,
  QR_UPLOAD_BYTES,
  isVanId,
  sniffQrType,
} from "@/lib/vanQr";

/**
 * A van's QR image: put one up, take one down, or look at one.
 *
 * Storage stays shut to every client — storage.rules deny all — so this route
 * is the only door, and it checks the role claim the same way firestore.rules
 * do. The image lives at vans/{vanId}/qr.{ext}; the van document records the
 * path, the decoded text and when it changed. Clients cannot write those three
 * fields themselves (they are not in the rules' vanFields), so the document and
 * the file can only ever change together, here.
 *
 *   POST   multipart  vanId, file, qrText?   → upload or replace
 *   DELETE json       { vanId }              → remove file and fields
 *   PUT    json       { vanId, mode }        → read: a short-lived signed URL
 *                                              ("url") or the bytes ("bytes")
 *
 * Writing is the Repairs login's and the dispatcher's. Reading is whoever can
 * read the vans database.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITERS = ["repairs", "dispatcher"] as const;
const READERS = ["repairs", "dispatcher", "closer"] as const;

/** How long a signed URL works for. Long enough to look, print and download. */
const SIGNED_URL_MS = 10 * 60 * 1000;

function vanRef(vanId: string) {
  return getAdminDb().collection("vans").doc(vanId);
}

/** The stored path, only if it really is this van's — never a path to go and fetch on faith. */
function ownPath(vanId: string, value: unknown): string | null {
  return typeof value === "string" && value.startsWith(`vans/${vanId}/qr.`) ? value : null;
}

export async function POST(request: Request) {
  const caller = await requireRole(request, WRITERS);
  if (!caller) return fail("Only the Repairs login or the dispatcher can change QR codes.", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("That upload did not arrive whole. Try again.", 400);
  }

  const vanId = form.get("vanId");
  const file = form.get("file");
  const rawText = form.get("qrText");
  if (!isVanId(vanId)) return fail("Which van?", 400);
  if (!(file instanceof Blob)) return fail("No image was attached.", 400);
  if (file.size === 0) return fail("That image is empty.", 400);
  if (file.size > QR_UPLOAD_BYTES) return fail("That image is too big — the most is 5 MB.", 413);

  const qrText =
    typeof rawText === "string" && rawText.length > 0 ? rawText.slice(0, QR_TEXT_MAX) : null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffQrType(bytes);
  if (!type) return fail("Only PNG, JPG or WebP images.", 415);

  const ref = vanRef(vanId);
  let previous: string | null = null;
  try {
    const snapshot = await ref.get();
    if (!snapshot.exists) return fail("That van is not in the database any more.", 404);
    previous = ownPath(vanId, snapshot.get("qrPath"));
  } catch (error) {
    console.error("Could not read the van:", error);
    return fail("Could not read that van.", 500);
  }

  const path = `vans/${vanId}/qr.${EXTENSION[type]}`;
  const bucket = getAdminBucket();
  try {
    await bucket.file(path).save(Buffer.from(bytes), {
      resumable: false,
      contentType: type,
      metadata: { cacheControl: "private, max-age=600" },
    });
  } catch (error) {
    console.error(`Could not store ${path}:`, error);
    return fail("The image could not be stored. Try again.", 502);
  }

  try {
    await ref.update({
      qrPath: path,
      qrText,
      qrUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.uid,
    });
  } catch (error) {
    console.error("Could not record the QR on the van:", error);
    return fail("The image was stored but the van did not update. Try again.", 500);
  }

  // A PNG replacing a JPG leaves the JPG behind under another name. Tidy it.
  if (previous && previous !== path) {
    await bucket.file(previous).delete({ ignoreNotFound: true }).catch((error: unknown) => {
      console.error(`Could not remove the old ${previous}:`, error);
    });
  }

  return Response.json({ qrPath: path, qrText });
}

export async function DELETE(request: Request) {
  const caller = await requireRole(request, WRITERS);
  if (!caller) return fail("Only the Repairs login or the dispatcher can change QR codes.", 403);

  let body: { vanId?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Malformed request.", 400);
  }
  const vanId = body.vanId;
  if (!isVanId(vanId)) return fail("Which van?", 400);

  // Everything under the van's folder, whatever it was called — a half-finished
  // replace can leave two.
  try {
    await getAdminBucket().deleteFiles({ prefix: `vans/${vanId}/` });
  } catch (error) {
    console.error(`Could not remove vans/${vanId}/:`, error);
    return fail("The image could not be removed. Try again.", 502);
  }

  try {
    const ref = vanRef(vanId);
    const snapshot = await ref.get();
    // Removing a van clears its QR first, so the van may already be gone.
    if (snapshot.exists) {
      await ref.update({
        qrPath: null,
        qrText: null,
        qrUpdatedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
      });
    }
  } catch (error) {
    console.error("Could not clear the QR on the van:", error);
    return fail("The image was removed but the van did not update. Try again.", 500);
  }

  return Response.json({ ok: true });
}

export async function PUT(request: Request) {
  const caller = await requireRole(request, READERS);
  if (!caller) return fail("Sign in again and retry.", 403);

  let body: { vanId?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Malformed request.", 400);
  }
  const vanId = body.vanId;
  if (!isVanId(vanId)) return fail("Which van?", 400);

  let path: string | null;
  try {
    const snapshot = await vanRef(vanId).get();
    path = snapshot.exists ? ownPath(vanId, snapshot.get("qrPath")) : null;
  } catch (error) {
    console.error("Could not read the van:", error);
    return fail("Could not read that van.", 500);
  }
  if (!path) return fail("That van has no QR code.", 404);

  const file = getAdminBucket().file(path);
  try {
    if (body.mode === "bytes") {
      const [buffer] = await file.download();
      const type = sniffQrType(buffer) ?? "application/octet-stream";
      return new Response(new Uint8Array(buffer), {
        headers: { "Content-Type": type, "Cache-Control": "no-store" },
      });
    }

    const expiresAt = Date.now() + SIGNED_URL_MS;
    const [url] = await file.getSignedUrl({ version: "v4", action: "read", expires: expiresAt });
    return Response.json({ url, expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Could not read ${path}:`, error);
    return fail("The QR image could not be fetched.", 502);
  }
}
