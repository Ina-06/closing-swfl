import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { KEY_TTL_MS, MAX_LIVE_KEYS, hashCode, newCode } from "@/lib/keys";

/**
 * Issuing and listing one-time closer codes.
 *
 * The dispatcher's only. The codes live in a collection that firestore.rules
 * closes to every client, so this route and the login route are the only two
 * things in the system that can see them at all — and neither ever reads a
 * code back, because none is stored.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type KeyRow = {
  id: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  revokedAt: number | null;
  note: string;
};

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function requireDispatcher(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.role === "dispatcher" ? decoded : null;
  } catch {
    return null;
  }
}

const millis = (value: unknown): number | null =>
  value instanceof Timestamp ? value.toMillis() : null;

function toRow(id: string, data: FirebaseFirestore.DocumentData): KeyRow {
  return {
    id,
    createdAt: millis(data.createdAt) ?? 0,
    expiresAt: millis(data.expiresAt) ?? 0,
    usedAt: millis(data.usedAt),
    revokedAt: millis(data.revokedAt),
    note: typeof data.note === "string" ? data.note : "",
  };
}

/** Recent codes, newest first. Never the salt, never the hash. */
export async function GET(request: Request) {
  if (!(await requireDispatcher(request))) {
    return fail("Only the dispatcher can see these.", 403);
  }

  const snapshot = await getAdminDb()
    .collection("accessKeys")
    .orderBy("createdAt", "desc")
    .limit(25)
    .get();

  return Response.json({
    keys: snapshot.docs.map((document) => toRow(document.id, document.data())),
  });
}

export async function POST(request: Request) {
  const caller = await requireDispatcher(request);
  if (!caller) return fail("Only the dispatcher can issue a code.", 403);

  let body: { note?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 60) : "";

  const keys = getAdminDb().collection("accessKeys");
  const now = Date.now();

  // Every login attempt hashes the input against each live code, so this cap
  // is what keeps that loop short as well as keeping the night tidy.
  const live = await keys.where("expiresAt", ">", Timestamp.now()).get();
  const usable = live.docs.filter((document) => {
    const data = document.data();
    return !data.usedAt && !data.revokedAt;
  });

  if (usable.length >= MAX_LIVE_KEYS) {
    return fail(
      `There are already ${usable.length} codes live. Revoke one before issuing another.`,
      409,
    );
  }

  const code = newCode();
  const { salt, hash } = await hashCode(code);

  const created = await keys.add({
    salt,
    hash,
    note,
    createdAt: Timestamp.fromMillis(now),
    createdBy: caller.uid,
    expiresAt: Timestamp.fromMillis(now + KEY_TTL_MS),
    usedAt: null,
    usedBy: null,
    revokedAt: null,
  });

  // The only time the code exists anywhere outside the recipient's hands.
  // It is not logged, and there is no route that can return it again.
  return Response.json({
    code,
    id: created.id,
    expiresAt: now + KEY_TTL_MS,
  });
}
