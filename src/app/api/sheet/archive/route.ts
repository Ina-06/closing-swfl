import { archiveSheet } from "@/lib/server/archiveSheet";
import { fail, nightKeyOf, requireStaff } from "@/lib/server/auth";

/**
 * File the PDF for a night that has just been closed.
 *
 * Called by End Day straight after the close lands, and never waited on: the
 * closer's buttons do not depend on it, and if it fails — the yard has no
 * signal more often than it has some — the hourly job finds the close with no
 * copy and files it then. See lib/server/archiveSheet.
 *
 * Calling it twice is harmless. A close that already has its copy answers
 * `archived: false` and nothing is written.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A render and an upload, on a cold start. Well inside this.
export const maxDuration = 60;

export async function POST(request: Request) {
  const caller = await requireStaff(request);
  if (!caller) return fail("Sign in again and retry.", 403);

  let body: { nightKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Malformed request.", 400);
  }

  const nightKey = nightKeyOf(body.nightKey);
  if (!nightKey) return fail("Which night?", 400);

  try {
    const result = await archiveSheet(nightKey, {
      by: caller.uid,
      auto: false,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Could not file the sheet for ${nightKey}:`, error);
    return fail(
      "The sheet could not be filed. It will be filed on the next hourly run.",
      500,
    );
  }
}
