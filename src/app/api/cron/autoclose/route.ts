import { getAdminDb } from "@/lib/firebase/admin";
import { cronAuthorised } from "@/lib/server/cronAuth";
import { stationNightKey } from "@/lib/constants";
import { archiveSheet, needsArchive } from "@/lib/server/archiveSheet";
import { autoCloseNight, SYSTEM } from "@/lib/server/autoClose";

/**
 * The 7 AM job: close what nobody closed, and file what was never filed.
 *
 * Run by Vercel Cron every hour at :05 UTC — see vercel.json. Hourly on
 * purpose. Vercel's schedule is UTC only and Florida moves between UTC-5 and
 * UTC-4, so no single fixed hour is 7:05 AM all year. Running every hour and
 * letting stationNightKey decide which nights are over lands the close at 7:05
 * station time in both halves of the year, with nothing hard-coded about
 * daylight saving. Every other run of the day is a retry and a backfill, and
 * finds nothing to do.
 *
 * Two passes, each one safe to repeat:
 *
 *   1. Close. Any night that is not closed and is earlier than tonight — the
 *      night the station is on now — is closed by autoCloseNight. Tonight is
 *      never touched: before 7 AM, last night still *is* tonight, which is the
 *      whole point of the rollover hour. Van issues are posted only for the
 *      night that has just ended; see autoCloseNight for why.
 *   2. File. Any closed night in the last sixty whose latest close has no PDF
 *      filed gets one. That covers the nights pass 1 just closed, an End Day
 *      whose own filing never left the yard, and a night reopened and closed
 *      again.
 *
 * One bad night never stops the others: each is tried on its own and its
 * failure goes into `errors`. `?dryRun=1` does every read and decision and
 * writes nothing, and the summary says what it would have done.
 *
 * Reads are kept small: the sixty most recent sessions by date, in one query
 * on a single field, which needs no composite index.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** How far back pass 1 looks for a night that was never closed. */
const CLOSE_WINDOW = 14;
/** How far back pass 2 looks for a close with nothing filed. */
const ARCHIVE_WINDOW = 60;
/**
 * How many PDFs one run will render. The first run after deploy may find two
 * months of nights with nothing filed; this keeps it well inside the time
 * limit, and the next hour carries on from where it stopped.
 */
const ARCHIVE_PER_RUN = 15;

/** The night before a night key, as a key. Calendar arithmetic, in UTC. */
function nightBefore(nightKey: string): string {
  const day = new Date(`${nightKey}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

type Summary = {
  dryRun: boolean;
  tonight: string;
  closed: {
    night: string;
    repairsPushed: number;
    missingClockOut: number;
    fleetEnded: boolean;
  }[];
  repairsPushed: number;
  archived: { night: string; path: string; rows: number }[];
  skipped: { night: string; reason: string }[];
  errors: { night: string; step: "close" | "archive"; message: string }[];
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: Request) {
  // Only Vercel's scheduler — see cronAuthorised.
  const allowed = cronAuthorised(request);
  if (allowed === null) {
    console.error("CRON_SECRET is not set; refusing to run.");
    return Response.json({ error: "Not configured." }, { status: 500 });
  }
  if (!allowed) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const tonight = stationNightKey(new Date());
  const lastNight = nightBefore(tonight);

  const summary: Summary = {
    dryRun,
    tonight,
    closed: [],
    repairsPushed: 0,
    archived: [],
    skipped: [],
    errors: [],
  };

  let sessions;
  try {
    sessions = await getAdminDb()
      .collection("sessions")
      .orderBy("date", "desc")
      .limit(ARCHIVE_WINDOW)
      .get();
  } catch (error) {
    console.error("Autoclose could not read the sessions:", error);
    return Response.json({ error: "Could not read the sessions." }, { status: 500 });
  }

  // Pass 1 — close.
  const justClosed = new Set<string>();
  const recent = sessions.docs.slice(0, CLOSE_WINDOW);
  for (const doc of recent) {
    const night = doc.id;
    const data = doc.data();
    if (data.status === "closed") continue;
    if (night >= tonight) {
      summary.skipped.push({ night, reason: "tonight — still in progress" });
      continue;
    }

    try {
      const result = await autoCloseNight(night, {
        pushRepairs: night === lastNight,
        dryRun,
      });
      if (!result.closed) {
        summary.skipped.push({ night, reason: result.reason });
        continue;
      }
      justClosed.add(night);
      summary.closed.push({
        night,
        repairsPushed: result.repairsPushed,
        missingClockOut: result.missingClockOut,
        fleetEnded: result.fleetEnded,
      });
      summary.repairsPushed += result.repairsPushed;
      if (night !== lastNight) {
        summary.skipped.push({
          night,
          reason: "older than last night — closed without posting van issues",
        });
      }
    } catch (error) {
      summary.errors.push({ night, step: "close", message: messageOf(error) });
    }
  }

  // Pass 2 — file. The snapshot above predates pass 1, so a night closed a
  // moment ago is counted by name rather than by what the snapshot says.
  let rendered = 0;
  for (const doc of sessions.docs) {
    const night = doc.id;
    if (!justClosed.has(night) && !needsArchive(doc.data())) continue;

    if (rendered >= ARCHIVE_PER_RUN) {
      summary.skipped.push({ night, reason: "file next run — this run's limit reached" });
      continue;
    }

    if (dryRun) {
      summary.skipped.push({ night, reason: "dry run: would file its PDF" });
      continue;
    }

    rendered += 1;
    try {
      // "auto" is about who closed the night, not who filed the copy: a
      // night the server closed whose filing failed last hour is still an
      // auto-closed night, and an End Day backfilled here is still End Day.
      const result = await archiveSheet(night, {
        by: SYSTEM,
        auto: justClosed.has(night) || doc.data().closedBy === "auto",
      });
      if (result.archived) {
        summary.archived.push({ night, path: result.path, rows: result.rows });
      } else {
        summary.skipped.push({ night, reason: result.reason });
      }
    } catch (error) {
      summary.errors.push({ night, step: "archive", message: messageOf(error) });
    }
  }

  console.log("Autoclose:", JSON.stringify(summary));
  return Response.json(summary, {
    status: summary.errors.length > 0 ? 207 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
