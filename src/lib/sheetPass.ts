import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived pass that lets one night's PDF be opened by a plain link.
 *
 * Every other route in this app is reached by fetch, with the id token in a
 * header. A link cannot carry a header — and on an iPhone a link is the only
 * thing that reaches Safari's own PDF viewer, which is the one place Karim has
 * a share button that is not ours. So the permission has to travel in the URL.
 *
 * What travels is a signature, not a key. It says one thing — "this night's
 * sheet, until this moment" — it is useless for anything else, and it cannot be
 * made to say anything else without the secret. The secret is never the door
 * code itself: APP_ACCESS_KEY is run through one HMAC first, so even a leaked
 * pass leads nowhere near the thing that opens the app.
 *
 * Six hours covers a shift and expires long before the next one starts. The
 * file it opens is the same file that gets posted to the drivers' group chat
 * twenty seconds later, so the window is the honest limit here, not secrecy.
 */
const TTL_MS = 6 * 60 * 60 * 1000;

function signingKey(): string {
  const secret = process.env.APP_ACCESS_KEY;
  if (!secret) throw new Error("APP_ACCESS_KEY is not set.");
  return createHmac("sha256", secret).update("sheet-view-v1").digest("hex");
}

function sign(nightKey: string, expiresAt: number): string {
  return createHmac("sha256", signingKey())
    .update(`${nightKey}.${expiresAt}`)
    .digest("hex");
}

export function mintPass(nightKey: string): string {
  const expiresAt = Date.now() + TTL_MS;
  return `${expiresAt}.${sign(nightKey, expiresAt)}`;
}

/**
 * The expiry is carried in the open and signed alongside the night, so moving
 * it invalidates the signature. Nothing is stored: there is no list of live
 * passes to keep, and a pass for a night that no longer exists simply renders
 * nothing.
 */
export function passIsGood(nightKey: string, pass: string): boolean {
  const parts = pass.split(".");
  if (parts.length !== 2) return false;

  const [rawExpiry, signature] = parts;
  if (!/^\d{13}$/.test(rawExpiry)) return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;

  const expiresAt = Number(rawExpiry);
  if (expiresAt < Date.now()) return false;

  // Compared byte by byte in constant time. Both sides are a fixed 32 bytes by
  // the time they get here, so this cannot throw on a length mismatch.
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(sign(nightKey, expiresAt), "hex"),
  );
}
