import { timingSafeEqual } from "node:crypto";
import { getAdminAuth } from "@/lib/firebase/admin";
import { ROLES, type Role } from "@/lib/constants";

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

  // One-time closer keys are Phase 8. The button exists so the shape of the
  // login screen does not change later; it just does not resolve to a token yet.
  if (role === "onetime") {
    return fail("One-time closer keys are not switched on yet.", 501);
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
