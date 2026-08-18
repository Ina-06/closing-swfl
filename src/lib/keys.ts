import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * One-time closer codes.
 *
 * Six digits, because a stand-in is going to be read them over the phone and
 * type them on a keypad in a car park. Six digits is also only a million
 * possibilities, so everything else here exists to make guessing pointless:
 *
 *   - the code is never stored, only a scrypt hash of it, so a leak of the
 *     database does not hand anyone a working code;
 *   - scrypt is deliberately slow, which caps how fast anyone can guess even
 *     with the route in front of them;
 *   - only a handful of codes are ever live at once, and each expires in
 *     twelve hours whether it is used or not.
 *
 * Server-only. Nothing in this file may be imported from a client component.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Twelve hours from issue, used or not. */
export const KEY_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * How many codes may be live at once.
 *
 * Every login attempt scrypts the input against every live code, so this is
 * both a sanity limit on how many stand-ins one night can have and the reason
 * that loop stays cheap.
 */
export const MAX_LIVE_KEYS = 5;

/** Six digits, leading zeros kept — "004821" is a real code. */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function hashCode(code: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(code, salt, 32);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

/**
 * Compare in constant time.
 *
 * The lengths are checked first because timingSafeEqual throws on a mismatch,
 * and a throw is itself a timing signal.
 */
export async function codeMatches(
  code: string,
  salt: string,
  hash: string,
): Promise<boolean> {
  const expected = Buffer.from(hash, "hex");
  if (expected.length === 0) return false;

  const actual = await scryptAsync(code, Buffer.from(salt, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}
