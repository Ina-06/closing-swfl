import { cronAuthorised } from "@/lib/server/cronAuth";
import { sendRegistrationReminders } from "@/lib/server/registrationReminders";

/**
 * The daily registration reminders — see sendRegistrationReminders.
 *
 * Run by Vercel Cron once a day at 12:00 UTC (7 AM EST, 8 AM EDT) — see
 * vercel.json. Safe to run again: a reminder already sent is recorded and
 * never sent twice. `?dryRun=1` reads everything, sends nothing and says who
 * would have been emailed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const allowed = cronAuthorised(request);
  if (allowed === null) {
    console.error("CRON_SECRET is not set; refusing to run.");
    return Response.json({ error: "Not configured." }, { status: 500 });
  }
  if (!allowed) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const summary = await sendRegistrationReminders({ dryRun });
    console.log("Registration reminders:", JSON.stringify(summary));
    return Response.json(summary, {
      status: summary.errors.length > 0 ? 207 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Registration reminders failed:", error);
    return Response.json({ error: "Could not read the vans." }, { status: 500 });
  }
}
