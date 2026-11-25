import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminBucket, getAdminDb } from "@/lib/firebase/admin";
import {
  REG_EXTENSION,
  REG_MAX_BYTES,
  cleanFileName,
  sniffRegType,
  type RegType,
} from "@/lib/regDocs";

/**
 * Putting a registration document away, and the van document's record of it.
 *
 * Server-only: the service account. Shared by the direct upload and the
 * signed-URL upload in /api/vans/registration, so a file is checked and
 * recorded the same way whichever road it came in on.
 */

export class RegError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function vanRef(vanId: string) {
  return getAdminDb().collection("vans").doc(vanId);
}

/** A fresh document id: short, URL-safe, never a guessable counter. */
export function newDocId(): string {
  return randomBytes(12).toString("base64url");
}

/** Where a big upload waits before it is checked. Never shown to anyone. */
export function stagingPath(vanId: string, docId: string) {
  return `registrations/${vanId}/incoming-${docId}`;
}

/** HEIC → JPEG. Loaded only when a HEIC arrives: the decoder is a few MB of WebAssembly. */
async function heicToJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const { default: convert } = await import("heic-convert");
  const jpeg = await convert({ buffer: Buffer.from(bytes), format: "JPEG", quality: 0.88 });
  return new Uint8Array(jpeg);
}

/**
 * Check the bytes, store them, and make them the van's active registration.
 *
 * The file goes up first and the van document changes second, inside a
 * transaction that also turns the previous active one off. If the document
 * write fails the stored file is taken back down, so nothing is left in
 * Storage that no van points at.
 */
export async function storeRegistration({
  vanId,
  docId,
  bytes,
  fileName,
  uid,
}: {
  vanId: string;
  docId: string;
  bytes: Uint8Array;
  fileName: unknown;
  uid: string;
}) {
  if (bytes.byteLength === 0) throw new RegError("That file is empty.", 400);
  if (bytes.byteLength > REG_MAX_BYTES) throw new RegError("That file is too big — the most is 10 MB.", 413);

  const incoming = sniffRegType(bytes);
  if (!incoming) throw new RegError("Only PDF, JPG, PNG, WebP or HEIC files.", 415);

  let type: RegType;
  let stored = bytes;
  if (incoming === "image/heic") {
    try {
      stored = await heicToJpeg(bytes);
    } catch (error) {
      console.error("Could not convert a HEIC:", error);
      throw new RegError("That HEIC photo could not be read. Export it as JPG and try again.", 415);
    }
    type = "image/jpeg";
  } else {
    type = incoming;
  }

  const ref = vanRef(vanId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new RegError("That van is not in the database any more.", 404);

  const path = `registrations/${vanId}/${docId}.${REG_EXTENSION[type]}`;
  const file = getAdminBucket().file(path);
  try {
    await file.save(Buffer.from(stored), {
      resumable: false,
      contentType: type,
      metadata: { cacheControl: "private, no-store" },
    });
  } catch (error) {
    console.error(`Could not store ${path}:`, error);
    throw new RegError("The file could not be stored. Try again.", 502);
  }

  const entry = {
    id: docId,
    type: "registration",
    storagePath: path,
    contentType: type,
    fileName: cleanFileName(fileName),
    uploadedAt: Timestamp.now(),
    uploadedBy: uid,
    active: true,
  };

  try {
    await getAdminDb().runTransaction(async (transaction) => {
      const fresh = await transaction.get(ref);
      if (!fresh.exists) throw new RegError("That van is not in the database any more.", 404);
      const docs = readDocs(fresh.get("registrationDocs")).map((doc) => ({ ...doc, active: false }));
      transaction.update(ref, {
        registrationDocs: [...docs, entry],
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      });
    });
  } catch (error) {
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    if (error instanceof RegError) throw error;
    console.error("Could not record the registration on the van:", error);
    throw new RegError("The file was not saved to the van. Try again.", 500);
  }

  return { id: docId, contentType: type };
}

/** The stored array as plain objects, dropping anything malformed. */
export function readDocs(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string",
  );
}

/** A stored path, only if it really is this van's registration — never one to fetch on faith. */
export function ownRegPath(vanId: string, value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith(`registrations/${vanId}/`) &&
    !value.includes("..") &&
    !value.includes("/incoming-")
    ? value
    : null;
}

/** A van's QR image path, only if it really is this van's. */
export function ownQrPath(vanId: string, value: unknown): string | null {
  return typeof value === "string" && value.startsWith(`vans/${vanId}/qr.`) ? value : null;
}
