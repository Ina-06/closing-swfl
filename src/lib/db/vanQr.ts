"use client";

import { requestAuthed } from "@/lib/api";
import type { VanRecord } from "@/lib/types";

/**
 * A van's QR image, through /api/vans/qr — the only way to it. See that route
 * and lib/vanQr.ts.
 *
 * Unlike the rest of the vans database these are awaited: an upload is seconds
 * of bytes rather than a Firestore write that shows locally at once, so the
 * screen has to be able to say it is still going.
 */

const ROUTE = "/api/vans/qr";

export async function uploadVanQr(vanId: string, image: Blob, qrText: string | null) {
  const form = new FormData();
  form.set("vanId", vanId);
  form.set("file", image, "qr");
  if (qrText) form.set("qrText", qrText);
  await requestAuthed(ROUTE, { method: "POST", form });
  forget(vanId);
}

export async function removeVanQr(vanId: string) {
  await requestAuthed(ROUTE, { method: "DELETE", json: { vanId } });
  forget(vanId);
}

/** Signed URLs already in hand, by van, for as long as they last and the image has not changed. */
const urls = new Map<string, { url: string; expiresAt: number; version: number }>();

function forget(vanId: string) {
  const held = urls.get(vanId);
  if (held?.url.startsWith("blob:")) URL.revokeObjectURL(held.url);
  urls.delete(vanId);
}

function versionOf(van: Pick<VanRecord, "qrUpdatedAt">): number {
  return van.qrUpdatedAt?.toMillis?.() ?? 0;
}

/** A short-lived URL for the van's uploaded image. */
export async function vanQrUrl(van: Pick<VanRecord, "id" | "qrUpdatedAt">): Promise<string> {
  const version = versionOf(van);
  const held = urls.get(van.id);
  // A minute's margin, so a URL never runs out between handing it over and the image loading.
  if (held && held.version === version && held.expiresAt - 60_000 > Date.now()) return held.url;

  try {
    const response = await requestAuthed(ROUTE, { method: "PUT", json: { vanId: van.id, mode: "url" } });
    const { url, expiresAt } = (await response.json()) as { url: string; expiresAt: number };
    urls.set(van.id, { url, expiresAt, version });
    return url;
  } catch (signing) {
    // No signed URL to be had — the local emulator cannot sign one, and a
    // misconfigured key would fail the same way. The same image through the
    // same authed route still shows, so show that rather than nothing.
    try {
      const blob = await vanQrBlob(van.id);
      const url = URL.createObjectURL(blob);
      if (held?.url.startsWith("blob:")) URL.revokeObjectURL(held.url);
      urls.set(van.id, { url, expiresAt: Number.MAX_SAFE_INTEGER, version });
      return url;
    } catch {
      throw signing;
    }
  }
}

/**
 * The uploaded image's bytes, for Download, Copy and Print of the original.
 * Fetched through the route rather than the signed URL so the bucket needs no
 * CORS setup for a canvas to read it.
 */
export async function vanQrBlob(vanId: string): Promise<Blob> {
  const response = await requestAuthed(ROUTE, { method: "PUT", json: { vanId, mode: "bytes" } });
  return response.blob();
}
