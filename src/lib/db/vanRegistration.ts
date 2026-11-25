"use client";

import { requestAuthed } from "@/lib/api";
import { shrinkForUpload } from "@/lib/qrImage";
import { REG_DIRECT_BYTES, guessKind } from "@/lib/regDocs";

/**
 * A van's registration documents, through /api/vans/registration — the only
 * way to them. See that route and lib/regDocs.ts.
 */

const ROUTE = "/api/vans/registration";

/**
 * Upload a registration and make it the van's active one.
 *
 * Small files go through our own route. A photo bigger than that is shrunk in
 * the browser first — a registration does not need 12 megapixels to be read.
 * A PDF or HEIC that is still too big goes straight to Storage on a signed
 * upload URL, then the route checks and files it. That leg needs the bucket's
 * CORS set once — see docs/storage-cors.json.
 */
export async function uploadRegistration(vanId: string, file: File): Promise<void> {
  let body: Blob = file;
  if (guessKind(file) === "image" && file.size > REG_DIRECT_BYTES) {
    body = await shrinkForUpload(file);
  }

  if (body.size <= REG_DIRECT_BYTES) {
    const form = new FormData();
    form.set("vanId", vanId);
    form.set("fileName", file.name);
    form.set("file", body, "registration");
    await requestAuthed(ROUTE, { method: "POST", form });
    return;
  }

  const started = await requestAuthed(ROUTE, {
    method: "POST",
    json: { action: "start", vanId, size: body.size },
  });
  const { docId, url } = (await started.json()) as { docId: string; url: string };

  let put: Response;
  try {
    put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body,
    });
  } catch {
    throw new Error(
      "Big files go straight to storage, and storage refused the connection. The bucket's CORS setting may be missing — see docs/storage-cors.json.",
    );
  }
  if (!put.ok) throw new Error(`Storage refused the upload (${put.status}). Try again.`);

  await requestAuthed(ROUTE, {
    method: "POST",
    json: { action: "finish", vanId, docId, fileName: file.name },
  });
}

export async function setRegistrationActive(vanId: string, docId: string, active: boolean) {
  await requestAuthed(ROUTE, {
    method: "PATCH",
    json: { vanId, docId, action: active ? "activate" : "deactivate" },
  });
}

/** Both the Repairs login and the dispatcher, which is why it is not a Firestore write. */
export async function setRegistrationExpiry(vanId: string, registrationExpires: string) {
  await requestAuthed(ROUTE, {
    method: "PATCH",
    json: { vanId, action: "expiry", registrationExpires },
  });
}

/** A document's bytes, for the preview. */
export async function registrationBlob(vanId: string, docId: string): Promise<Blob> {
  const response = await requestAuthed(ROUTE, { method: "PUT", json: { vanId, docId } });
  return response.blob();
}

/** Every file and record, for a van being removed for good. */
export async function removeAllRegistrations(vanId: string) {
  await requestAuthed(ROUTE, { method: "DELETE", json: { vanId } });
}
