import { vanKey } from "@/lib/vans";

/**
 * Van QR codes — the pure half, shared by the browser and the API route.
 *
 * Each van can carry one QR image, stored at vans/{vanId}/qr.{ext} in Storage
 * and only ever reached through /api/vans/qr: storage.rules deny every client.
 * The van document records where it is (`qrPath`), what it says when it could
 * be read (`qrText`) and when it last changed (`qrUpdatedAt`).
 */

/** What a QR image may be. Anything else is turned away at the picker and again on the server. */
export const QR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type QrType = (typeof QR_TYPES)[number];

/** The most a person may pick. */
export const QR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The most the route will be sent.
 *
 * Under Vercel's 4.5 MB request ceiling, with room for the form around it. A
 * picked file bigger than this is shrunk in the browser before it goes — a QR
 * does not need a phone camera's 12 megapixels to stay readable.
 */
export const QR_UPLOAD_BYTES = 4 * 1024 * 1024;

/** The longest text a QR code can hold (version 40, numeric-ish worst case). */
export const QR_TEXT_MAX = 7089;

export const QR_ACCEPT = QR_TYPES.join(",");

export const EXTENSION: Record<QrType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** A Firestore document id, and nothing that could walk out of vans/. */
export function isVanId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * The image type from the bytes themselves, or null.
 *
 * The browser's own label for a file is a guess from its name, so the server
 * reads the first few bytes rather than trusting it.
 */
export function sniffQrType(bytes: Uint8Array): QrType | null {
  const at = (index: number, ...values: number[]) =>
    values.every((value, offset) => bytes[index + offset] === value);

  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  // "RIFF" .... "WEBP"
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Why a picked file cannot be a QR image, or null if it can. */
export function qrFileProblem(file: { type: string; size: number }): string | null {
  if (!(QR_TYPES as readonly string[]).includes(file.type)) {
    return "Only PNG, JPG or WebP images.";
  }
  if (file.size > QR_MAX_BYTES) {
    return `Too big — ${(file.size / 1024 / 1024).toFixed(1)} MB. The most is 5 MB.`;
  }
  if (file.size === 0) return "That file is empty.";
  return null;
}

/**
 * The van a file is named after, as a van key, or "".
 *
 * "BR03.png", "br.03.jpg" and "BR.03 (XL).png" are all BR.03: the extension
 * goes, then the same rules that make "br 03" and "BR.3" one van on the
 * repairs board — see vanKey, which already drops case, dots, spaces, leading
 * zeros and a bracketed or trailing size like "(XL)". A "-qr" or " QR code"
 * on the end is how people name these files, so that goes too.
 */
export function vanKeyOfFilename(name: string): string {
  const stem = name
    .replace(/\.[A-Za-z0-9]{2,5}$/, "")
    .replace(/[\s._-]*qr(?:[\s._-]*code)?$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
  return vanKey(stem);
}

/** The filename a downloaded QR is saved as: BR.03 → "BR.03-qr.png". */
export function qrDownloadName(van: string): string {
  const safe = van.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-");
  return `${safe || "van"}-qr.png`;
}
