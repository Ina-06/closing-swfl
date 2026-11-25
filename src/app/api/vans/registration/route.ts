import { FieldValue } from "firebase-admin/firestore";
import { getAdminBucket, getAdminDb } from "@/lib/firebase/admin";
import { fail, requireRole } from "@/lib/server/auth";
import {
  RegError,
  newDocId,
  ownRegPath,
  readDocs,
  stagingPath,
  storeRegistration,
  vanRef,
} from "@/lib/server/regStore";
import { REG_DIRECT_BYTES, REG_MAX_BYTES, isDocId } from "@/lib/regDocs";
import { isRegistrationDate } from "@/lib/registration";
import { isVanId } from "@/lib/vanQr";

/**
 * A van's registration documents, from the vans database.
 *
 * Storage stays shut to every client — storage.rules deny all — so this route
 * is the only door, and it checks the same role claim firestore.rules read.
 * The `registrationDocs` array on the van is not a field a client may write,
 * so a document and its file can only change together, here.
 *
 *   POST multipart  vanId, file                  → upload (up to 4 MB)
 *   POST json       { action: "start", vanId }   → a signed URL to PUT a
 *                                                  bigger file to (up to 10 MB)
 *   POST json       { action: "finish", vanId, docId, fileName }
 *                                                → check and file that upload
 *   PATCH json      { vanId, action: "deactivate" | "activate", docId }
 *                   { vanId, action: "expiry", registrationExpires }
 *   PUT json        { vanId, docId }             → the file's bytes, to preview
 *   DELETE json     { vanId }                    → every file and record, for
 *                                                  a van removed for good
 *
 * Writing is the Repairs login's and the dispatcher's. Previewing is whoever
 * can read the vans database.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WRITERS = ["repairs", "dispatcher"] as const;
const READERS = ["repairs", "dispatcher", "closer"] as const;
const DENIED = "Only the Repairs login or the dispatcher can change registrations.";

function failWith(error: unknown, fallback: string) {
  if (error instanceof RegError) return fail(error.message, error.status);
  console.error(fallback, error);
  return fail(fallback, 500);
}

async function json(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const caller = await requireRole(request, WRITERS);
  if (!caller) return fail(DENIED, 403);

  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) return directUpload(request, caller.uid);

  const body = await json(request);
  if (!body) return fail("Malformed request.", 400);
  const vanId = body.vanId;
  if (!isVanId(vanId)) return fail("Which van?", 400);

  if (body.action === "start") {
    const size = typeof body.size === "number" ? body.size : 0;
    if (size > REG_MAX_BYTES) return fail("That file is too big — the most is 10 MB.", 413);
    try {
      const van = await vanRef(vanId).get();
      if (!van.exists) return fail("That van is not in the database any more.", 404);
      const docId = newDocId();
      const [url] = await getAdminBucket()
        .file(stagingPath(vanId, docId))
        .getSignedUrl({
          version: "v4",
          action: "write",
          expires: Date.now() + 15 * 60 * 1000,
          contentType: "application/octet-stream",
        });
      return Response.json({ docId, url }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return failWith(error, "Could not start that upload.");
    }
  }

  if (body.action === "finish") {
    const docId = body.docId;
    if (!isDocId(docId)) return fail("Which upload?", 400);
    const staged = getAdminBucket().file(stagingPath(vanId, docId));
    try {
      const [exists] = await staged.exists();
      if (!exists) return fail("The upload did not arrive. Try again.", 404);
      const [buffer] = await staged.download();
      const result = await storeRegistration({
        vanId,
        docId,
        bytes: new Uint8Array(buffer),
        fileName: body.fileName,
        uid: caller.uid,
      });
      return Response.json(result);
    } catch (error) {
      return failWith(error, "Could not file that upload.");
    } finally {
      await staged.delete({ ignoreNotFound: true }).catch(() => {});
    }
  }

  return fail("Malformed request.", 400);
}

async function directUpload(request: Request, uid: string) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("That upload did not arrive whole. Try again.", 400);
  }

  const vanId = form.get("vanId");
  const file = form.get("file");
  if (!isVanId(vanId)) return fail("Which van?", 400);
  if (!(file instanceof Blob)) return fail("No file was attached.", 400);
  if (file.size > REG_DIRECT_BYTES) return fail("That file is too big to send this way.", 413);

  try {
    const result = await storeRegistration({
      vanId,
      docId: newDocId(),
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: form.get("fileName"),
      uid,
    });
    return Response.json(result);
  } catch (error) {
    return failWith(error, "Could not save that registration.");
  }
}

export async function PATCH(request: Request) {
  const caller = await requireRole(request, WRITERS);
  if (!caller) return fail(DENIED, 403);

  const body = await json(request);
  if (!body) return fail("Malformed request.", 400);
  const vanId = body.vanId;
  if (!isVanId(vanId)) return fail("Which van?", 400);
  const ref = vanRef(vanId);

  if (body.action === "expiry") {
    const expires = typeof body.registrationExpires === "string" ? body.registrationExpires.trim() : "";
    if (expires && !isRegistrationDate(expires)) return fail("That is not a real date.", 400);
    try {
      const snapshot = await ref.get();
      if (!snapshot.exists) return fail("That van is not in the database any more.", 404);
      await ref.update({
        registrationExpires: expires,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
      });
      return Response.json({ ok: true });
    } catch (error) {
      return failWith(error, "Could not save that date.");
    }
  }

  if (body.action === "activate" || body.action === "deactivate") {
    const docId = body.docId;
    if (!isDocId(docId)) return fail("Which document?", 400);
    const turnOn = body.action === "activate";
    try {
      await getAdminDb().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new RegError("That van is not in the database any more.", 404);
        const docs = readDocs(snapshot.get("registrationDocs"));
        if (!docs.some((doc) => doc.id === docId)) {
          throw new RegError("That document is not on this van.", 404);
        }
        // Turning one on turns every other one off: one registration at a time.
        const next = docs.map((doc) =>
          doc.id === docId ? { ...doc, active: turnOn } : turnOn ? { ...doc, active: false } : doc,
        );
        transaction.update(ref, {
          registrationDocs: next,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: caller.uid,
        });
      });
      return Response.json({ ok: true });
    } catch (error) {
      return failWith(error, "Could not change that document.");
    }
  }

  return fail("Malformed request.", 400);
}

export async function PUT(request: Request) {
  const caller = await requireRole(request, READERS);
  if (!caller) return fail("Sign in again and retry.", 403);

  const body = await json(request);
  if (!body) return fail("Malformed request.", 400);
  const { vanId, docId } = body;
  if (!isVanId(vanId) || !isDocId(docId)) return fail("Which document?", 400);

  let path: string | null = null;
  let contentType = "application/octet-stream";
  try {
    const snapshot = await vanRef(vanId).get();
    const doc = readDocs(snapshot.get("registrationDocs")).find((entry) => entry.id === docId);
    path = doc ? ownRegPath(vanId, doc.storagePath) : null;
    if (doc && typeof doc.contentType === "string") contentType = doc.contentType;
  } catch (error) {
    return failWith(error, "Could not read that van.");
  }
  if (!path) return fail("That document is not on this van.", 404);

  try {
    const [buffer] = await getAdminBucket().file(path).download();
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failWith(error, "The file could not be fetched.");
  }
}

export async function DELETE(request: Request) {
  const caller = await requireRole(request, WRITERS);
  if (!caller) return fail(DENIED, 403);

  const body = await json(request);
  const vanId = body?.vanId;
  if (!isVanId(vanId)) return fail("Which van?", 400);

  try {
    await getAdminBucket().deleteFiles({ prefix: `registrations/${vanId}/` });
  } catch (error) {
    return failWith(error, "The files could not be removed. Try again.");
  }

  try {
    const ref = vanRef(vanId);
    const snapshot = await ref.get();
    if (snapshot.exists) {
      await ref.update({
        registrationDocs: [],
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
      });
    }
  } catch (error) {
    return failWith(error, "The files were removed but the van did not update.");
  }

  return Response.json({ ok: true });
}
