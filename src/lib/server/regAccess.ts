import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Who may look at a registration on reg.swfl.app, and how often.
 *
 * Server-only. Three things live here:
 *
 *   The PIN cookie   DRIVER_PIN, typed once per phone, remembered for 30 days
 *                    in an httpOnly cookie. The cookie carries a signature over
 *                    the PIN itself, so changing DRIVER_PIN signs every phone
 *                    out at once. No DRIVER_PIN, no PIN screen.
 *
 *   View tokens      A search hands back, per document, a token good for ten
 *                    minutes and for that one document. /api/reg/doc wants it,
 *                    so nothing can be fetched by guessing a van's id, and a
 *                    copied link stops working.
 *
 *   Throttles        Counters in Firestore, shared by every server instance —
 *                    the same kind the one-time closer codes use.
 *
 * Signing uses a key derived from FIREBASE_SERVICE_ACCOUNT_KEY: it is already
 * the server's most closely held secret, and it saves one more env var.
 */

export const PIN_COOKIE = "swfl_reg_pin";
export const PIN_COOKIE_DAYS = 30;
const VIEW_TOKEN_MS = 10 * 60 * 1000;

function signingKey(): Buffer {
  const secret = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!secret) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set.");
  return createHash("sha256").update(`swfl-reg-v1:${secret}`).digest();
}

function sign(message: string): string {
  return createHmac("sha256", signingKey()).update(message).digest("base64url");
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/* ------------------------------------------------------------------------ */
/* PIN                                                                      */
/* ------------------------------------------------------------------------ */

/** The PIN drivers type, or null when none is set and the page is open. */
export function driverPin(): string | null {
  const pin = process.env.DRIVER_PIN?.trim();
  return pin ? pin : null;
}

export function pinMatches(typed: string): boolean {
  const pin = driverPin();
  return pin !== null && sameText(typed.trim(), pin);
}

/** The cookie a right PIN earns: when it runs out, and a signature over that and the PIN. */
export function pinCookieValue(): { value: string; maxAge: number } {
  const pin = driverPin() ?? "";
  const maxAge = PIN_COOKIE_DAYS * 24 * 60 * 60;
  const expires = Date.now() + maxAge * 1000;
  return { value: `${expires}.${sign(`pin|${pin}|${expires}`)}`, maxAge };
}

/** Whether this cookie lets the phone in. Always true when no PIN is set. */
export function pinCookieOk(value: string | undefined): boolean {
  const pin = driverPin();
  if (pin === null) return true;
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < Date.now()) return false;
  return sameText(signature, sign(`pin|${pin}|${expires}`));
}

/** The PIN cookie off a request. */
export function pinCookieOf(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === PIN_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/* ------------------------------------------------------------------------ */
/* View tokens                                                              */
/* ------------------------------------------------------------------------ */

/** A ten-minute pass to one document. `docId` is "qr" for the van's QR. */
export function viewToken(vanId: string, docId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + VIEW_TOKEN_MS;
  return { token: `${expiresAt}.${sign(`doc|${vanId}|${docId}|${expiresAt}`)}`, expiresAt };
}

export function viewTokenOk(token: string | null, vanId: string, docId: string): "ok" | "expired" | "bad" {
  if (!token) return "bad";
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return "bad";
  if (!sameText(signature, sign(`doc|${vanId}|${docId}|${expires}`))) return "bad";
  return Number(expires) < Date.now() ? "expired" : "ok";
}

/* ------------------------------------------------------------------------ */
/* Throttles                                                                */
/* ------------------------------------------------------------------------ */

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

/** An address as a document id: hashed, so the database never holds anyone's IP. */
function ipKey(ip: string): string {
  return createHash("sha256").update(`swfl-reg-ip:${ip}`).digest("base64url").slice(0, 22);
}

function counterRef(name: string) {
  return getAdminDb().collection("throttle").doc(name);
}

/**
 * Count one more against `name`, and say whether it was still under `limit`
 * in the current window. A fixed window: simple, and generous enough here.
 */
async function bump(name: string, limit: number, windowMs: number): Promise<boolean> {
  const ref = counterRef(name);
  return getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const started = data?.windowStart instanceof Timestamp ? data.windowStart.toMillis() : 0;
    if (Date.now() - started > windowMs) {
      transaction.set(ref, { windowStart: Timestamp.now(), count: 1 });
      return true;
    }
    const count = (typeof data?.count === "number" ? data.count : 0) + 1;
    transaction.set(ref, { count }, { merge: true });
    return count <= limit;
  });
}

/** Whether `name` is already at `limit` in its window, without counting this one. */
async function atLimit(name: string, limit: number, windowMs: number): Promise<boolean> {
  const data = (await counterRef(name).get()).data();
  if (!data) return false;
  const started = data.windowStart instanceof Timestamp ? data.windowStart.toMillis() : 0;
  if (Date.now() - started > windowMs) return false;
  return (typeof data.count === "number" ? data.count : 0) >= limit;
}

const MINUTE = 60_000;

/** 20 searches a minute from one address. */
export function allowSearch(ip: string) {
  return bump(`reg-search-${ipKey(ip)}`, 20, MINUTE);
}

/** 60 document opens a minute from one address — a page of thumbnails would be far less. */
export function allowView(ip: string) {
  return bump(`reg-view-${ipKey(ip)}`, 60, MINUTE);
}

const PIN_WINDOW = 15 * MINUTE;
const PIN_PER_IP = 10;
const PIN_STATION = 50;

/** Whether PIN guessing is shut for this address, or for everybody. */
export async function pinLocked(ip: string): Promise<boolean> {
  const [mine, all] = await Promise.all([
    atLimit(`reg-pin-${ipKey(ip)}`, PIN_PER_IP, PIN_WINDOW),
    atLimit("reg-pin-all", PIN_STATION, PIN_WINDOW),
  ]);
  return mine || all;
}

/** One wrong PIN, counted against the address and the station. */
export async function noteWrongPin(ip: string) {
  await Promise.all([
    bump(`reg-pin-${ipKey(ip)}`, PIN_PER_IP, PIN_WINDOW),
    bump("reg-pin-all", PIN_STATION, PIN_WINDOW),
  ]);
}

/** What every reg response carries: never cached, never indexed. */
export const REG_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export function regFail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status, headers: REG_HEADERS });
}
