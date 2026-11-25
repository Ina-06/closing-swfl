import { getAdminAuth } from "@/lib/firebase/admin";

/**
 * Who is asking, for the routes that hand out a night's sheet.
 *
 * Server-only: it reaches the Admin SDK. Shared by every sheet route — the live
 * render, the archiver and the stored copy — so the three can never disagree
 * about who is allowed a night's PDF. It is the same answer it always was:
 * either side of the close, a stand-in included, because the sheet is the
 * night's and both of them run the night.
 *
 * Returns the decoded token, or null for anything else — no header, a bad
 * token, an expired one, or a role that has no business with the sheet.
 */
export async function requireStaff(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const role = decoded.role;
    return role === "dispatcher" || role === "closer" || role === "onetime"
      ? decoded
      : null;
  } catch {
    return null;
  }
}

/** A night key, or "" for anything that is not one. */
export function nightKeyOf(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : "";
}

export function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * The caller's decoded token if their role is one of `roles`, or null.
 *
 * The general form of requireStaff, for routes that are not about a night —
 * the van QR codes, which belong to the station and follow the vans
 * database's own lines rather than the sheet's.
 */
export async function requireRole(request: Request, roles: readonly string[]) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return typeof decoded.role === "string" && roles.includes(decoded.role)
      ? decoded
      : null;
  } catch {
    return null;
  }
}
