import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

/**
 * Kill a code.
 *
 * Not a delete — the record of it having existed stays, like everything else
 * in this app. Setting revokedAt does two jobs: the login route stops
 * accepting it, and firestore.rules stops honouring any session already
 * signed in with it. That second one is why revoking works on a stand-in who
 * is already holding an open phone.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.role !== "dispatcher") {
      return Response.json({ error: "Only the dispatcher can revoke." }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Sign in again and retry." }, { status: 403 });
  }

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "Which code?" }, { status: 400 });

  const reference = getAdminDb().collection("accessKeys").doc(id);
  const existing = await reference.get();
  if (!existing.exists) {
    return Response.json({ error: "That code is not on file." }, { status: 404 });
  }

  // Revoking twice is not an error — the dispatcher pressed it again because
  // they were not sure the first one landed.
  if (!existing.data()?.revokedAt) {
    await reference.update({ revokedAt: Timestamp.now() });
  }

  return Response.json({ ok: true });
}
