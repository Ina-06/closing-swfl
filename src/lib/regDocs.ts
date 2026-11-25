import { daysUntil, isRegistrationDate } from "@/lib/registration";
import type { RegistrationDoc } from "@/lib/types";

/**
 * Van registration documents — the pure half, shared by the browser, the API
 * routes and the driver page.
 *
 * Each van keeps every registration ever uploaded for it in
 * `registrationDocs`, newest last. Exactly one at most is `active`: the one a
 * driver is shown. Replacing or deactivating one never deletes it — the old
 * file stays in Storage at registrations/{vanId}/{docId}.{ext} for the record.
 *
 * The array is written only by /api/vans/registration with the service
 * account: firestore.rules leave it out of the fields a client may change, so
 * a document and its file can only ever move together.
 */

/** What a stored registration may be. HEIC is turned into JPEG on the way in. */
export const REG_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type RegType = (typeof REG_TYPES)[number];

/** What the server accepts on the way in: the stored types, plus HEIC/HEIF. */
export type IncomingType = RegType | "image/heic";

export const REG_EXTENSION: Record<RegType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The most a person may pick. */
export const REG_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The most that can go through our own route in one request.
 *
 * Under Vercel's 4.5 MB request ceiling, with room for the form around it.
 * Anything bigger goes straight to Storage on a signed upload URL instead —
 * see lib/db/vanRegistration.ts.
 */
export const REG_DIRECT_BYTES = 4 * 1024 * 1024;

/** The file picker's filter. Extensions as well as types: Windows labels HEIC as nothing at all. */
export const REG_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";

/** A Firestore id, or the id we mint for a document: nothing that could walk out of a folder. */
export function isDocId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/**
 * The file type from the bytes themselves, or null.
 *
 * A browser's label for a file is a guess from its name — and Chrome on
 * Windows labels a HEIC as nothing — so the server reads the first bytes.
 */
export function sniffRegType(bytes: Uint8Array): IncomingType | null {
  const at = (index: number, ...values: number[]) =>
    values.every((value, offset) => bytes[index + offset] === value);
  const ascii = (index: number, length: number) =>
    String.fromCharCode(...bytes.subarray(index, index + length));

  if (at(0, 0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  // ISO-BMFF: ....ftyp<brand>. These brands are HEIC/HEIF stills.
  if (ascii(4, 4) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 4))) {
    return "image/heic";
  }
  return null;
}

/** What a picked file looks like from its label and name — a first guess for the browser only. */
export function guessKind(file: { type: string; name: string }): "pdf" | "image" | "heic" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/image\/hei[cf]/.test(file.type) || /\.hei[cf]$/.test(name)) return "heic";
  if (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/.test(name)) return "image";
  return null;
}

/** Why a picked file cannot be a registration, or null if it can. */
export function regFileProblem(file: { type: string; name: string; size: number }): string | null {
  if (!guessKind(file)) return "Only PDF, JPG, PNG, WebP or HEIC files.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > REG_MAX_BYTES) {
    return `Too big — ${(file.size / 1024 / 1024).toFixed(1)} MB. The most is 10 MB.`;
  }
  return null;
}

/** The registration a driver is shown, or null. */
export function activeRegistration(docs: readonly RegistrationDoc[]): RegistrationDoc | null {
  for (let index = docs.length - 1; index >= 0; index--) {
    if (docs[index].active && docs[index].type === "registration") return docs[index];
  }
  return null;
}

/**
 * A file name worth keeping: no folders, nothing a screen would choke on,
 * not a paragraph. "" stays "" — the modal says "Uploaded file".
 */
export function cleanFileName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name
    .replace(/^.*[\\/]/, "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, 120);
}

/** How the expiry reads on the driver card and in the filter. 30 days is when to start chasing. */
export const EXPIRING_DAYS = 30;

export type DriverState = "ok" | "soon" | "expired" | "none";

export function driverState(expires: string, today: string): DriverState {
  if (!isRegistrationDate(expires)) return "none";
  const left = daysUntil(expires, today);
  if (left < 0) return "expired";
  if (left <= EXPIRING_DAYS) return "soon";
  return "ok";
}

/** Who uploaded it, for people: the uid is the role's — "role-repairs" is Repairs. */
export function uploaderLabel(uid: string): string {
  const role = /^role-(.+)$/.exec(uid)?.[1];
  if (!role) return uid ? "Someone else" : "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * A search box's van number, for matching: trimmed, upper-cased, spaces and
 * dashes gone. The van key rules (lib/vans.ts) then drop dots and leading
 * zeros, so "rt-056", "RT 56" and "RT.56" are all one search.
 */
export function normalizeSearch(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-–—]+/g, "").slice(0, 24);
}
