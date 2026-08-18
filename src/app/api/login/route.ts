import { timingSafeEqual } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ROLES, type Role } from "@/lib/constants";
import { codeMatches, isCode } from "@/lib/keys";

/**
 * The key check happens here, on the server, and nowhere else.
 *
 * The browser never sees APP_ACCESS_KEY. It posts what was typed, and gets
 * back either a Firebase custom token carrying a `role` claim, or an error.
 * The role claim is what firestore.rules reads — a client that fakes its way
 * past this screen still cannot read or write a single document.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time compare, so response timing never leaks how much of the key matched. */
function keyMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still burn a comparison so a wrong-length key is not measurably faster.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Per-IP throttle. Serverless instances come and go, so this is a speed bump
 * rather than a wall — enough to make guessing a shared key impractical
 * without ever locking out the closer mid-wave.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function throttled(ip: string): boolean {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  record.count += 1;
  return record.count > MAX_ATTEMPTS;
}

function fail(message: string, status = 401) {
  return Response.json({ error: message }, { status });
}

/**
 * A durable brake on guessing a six-digit code.
 *
 * The per-IP counter above lives in memory, which on a serverless host means
 * it lives for as long as one instance does — a speed bump, and easy to walk
 * around with a second address. Six digits is only a million possibilities, so
 * for these the count is kept in the database where every instance shares it.
 *
 * Deliberately generous: a stand-in mistyping twice must never be locked out,
 * and someone burning the budget on purpose only costs the station the ability
 * to hand out a code for a quarter of an hour.
 */
const ONETIME_WINDOW_MS = 15 * 60_000;
const ONETIME_MAX_FAILURES = 30;

function failureRef() {
  return getAdminDb().collection("throttle").doc("onetime");
}

async function onetimeLocked(): Promise<boolean> {
  const snapshot = await failureRef().get();
  const data = snapshot.data();
  if (!data) return false;

  const started = data.windowStart instanceof Timestamp ? data.windowStart.toMillis() : 0;
  if (Date.now() - started > ONETIME_WINDOW_MS) return false;
  return (typeof data.failures === "number" ? data.failures : 0) >= ONETIME_MAX_FAILURES;
}

async function noteOnetimeFailure() {
  const reference = failureRef();
  await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    const started =
      data?.windowStart instanceof Timestamp ? data.windowStart.toMillis() : 0;

    if (Date.now() - started > ONETIME_WINDOW_MS) {
      transaction.set(reference, { windowStart: Timestamp.now(), failures: 1 });
      return;
    }

    transaction.set(
      reference,
      { failures: (typeof data?.failures === "number" ? data.failures : 0) + 1 },
      { merge: true },
    );
  });
}

/**
 * Redeem a one-time closer code.
 *
 * We cannot look a code up — nothing here knows what any of them are, only
 * their hashes. So every live code is tried in turn. That sounds wasteful and
 * is actually the point: scrypt is slow, there are never more than a handful
 * live, and an attacker guessing digits pays that cost on every attempt.
 *
 * The token carries the key's id and its expiry as claims, and firestore.rules
 * checks both on every read and write. A stand-in's access ending is therefore
 * not something the app remembers to do — it is something the database
 * enforces whether the phone cooperates or not.
 */
async function redeemOneTime(code: string) {
  if (!isCode(code)) {
    return fail("A one-time code is six digits.", 400);
  }

  if (await onetimeLocked()) {
    return fail(
      "Too many wrong codes have been tried. Wait fifteen minutes, or sign in with the station key.",
      429,
    );
  }

  const keys = getAdminDb().collection("accessKeys");
  const live = await keys.where("expiresAt", ">", Timestamp.now()).get();

  for (const document of live.docs) {
    const data = document.data();
    if (data.usedAt || data.revokedAt) continue;
    if (typeof data.salt !== "string" || typeof data.hash !== "string") continue;
    if (!(await codeMatches(code, data.salt, data.hash))) continue;

    const expiresAt: number = data.expiresAt.toMillis();

    /**
     * Single use, decided by the database rather than by us.
     *
     * Two people typing the same code at the same moment is not a scenario
     * worth losing, so the claim is taken in a transaction and the loser is
     * told the code is spent.
     */
    try {
      await getAdminDb().runTransaction(async (transaction) => {
        const fresh = await transaction.get(document.ref);
        const state = fresh.data();
        if (!state || state.usedAt || state.revokedAt) {
          throw new Error("spent");
        }
        transaction.update(document.ref, {
          usedAt: Timestamp.now(),
          usedBy: `onetime-${document.id}`,
        });
      });
    } catch {
      return fail("That code has already been used.");
    }

    const token = await getAdminAuth().createCustomToken(
      // Its own uid, so two stand-ins on two nights are never the same session.
      `onetime-${document.id}`,
      { role: "onetime", keyId: document.id, keyExp: expiresAt },
    );

    return Response.json({ token, role: "onetime", expiresAt });
  }

  // Only a genuine miss is counted. A code that was right but already spent
  // is someone confused, not someone guessing.
  await noteOnetimeFailure();
  return fail("That code is not right, or it has expired.");
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  if (throttled(ip)) {
    return fail("Too many attempts. Wait a minute and try again.", 429);
  }

  let body: { key?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Malformed request.", 400);
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";

  if (!ROLES.includes(role as Role)) {
    return fail("Pick a role.", 400);
  }
  if (!key) {
    return fail("Enter the access key.", 400);
  }

  if (role === "onetime") {
    return redeemOneTime(key);
  }

  const expected = process.env.APP_ACCESS_KEY;
  if (!expected) {
    console.error("APP_ACCESS_KEY is not set — no one can log in.");
    return fail("The server is missing its access key. Tell the dispatcher.", 500);
  }

  if (!keyMatches(key, expected)) {
    return fail("That key is not right.");
  }

  try {
    // One stable uid per role. Both devices signing in as the closer share it,
    // which is what we want — the closer is a station position, not a person.
    const token = await getAdminAuth().createCustomToken(`role-${role}`, {
      role,
    });
    return Response.json({ token, role });
  } catch (error) {
    console.error("Failed to mint a custom token:", error);
    return fail("Could not start a session. Check the server credentials.", 500);
  }
}
