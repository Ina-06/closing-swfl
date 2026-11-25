import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { stationDateKey } from "@/lib/constants";
import {
  daysUntil,
  dueReminder,
  isRegistrationDate,
  markSent,
  registrationLabel,
} from "@/lib/registration";
import { emailList, escapeHtml, sendEmail } from "@/lib/server/email";

/**
 * The daily registration reminders: 7, 5, 3 and 1 day before a van's
 * registration expires, one email to the office and one to that van's vendor.
 *
 * Who gets them is configuration, not code, so no address sits in the repo:
 *
 *   REGISTRATION_EMAIL_TO   the office, comma-separated.
 *   VENDOR_EMAILS           JSON, vendor name → addresses:
 *                           {"Vendor A": "a@x.com", "Vendor B": "b@y.com, c@y.com"}
 *                           Names match the vans database's Vendor column,
 *                           ignoring case and extra spaces.
 *
 * What has been sent is kept in vanRegistrationNotices, one document per van
 * per expiry date, with the office's and the vendor's steps apart — a vendor
 * send that failed is retried tomorrow without emailing the office twice.
 * Changing a van's registration date starts a new document, so the renewed
 * registration gets its own 7-5-3-1 next year. Clients never read or write
 * the collection; firestore.rules denies it by the catch-all.
 */

const NOTICES = "vanRegistrationNotices";

type Notice = { office: number[]; vendor: number[] };

export type ReminderSummary = {
  dryRun: boolean;
  today: string;
  sent: { van: string; daysLeft: number; to: "office" | "vendor"; recipients: string[] }[];
  /** A vendor reminder was due, but there is no address for that vendor. */
  noVendorEmail: { van: string; vendor: string }[];
  errors: { van: string; to: "office" | "vendor" | "van"; message: string }[];
  /** Configuration problems that stop part of the job. */
  config: string[];
};

/** "  Vendor  A " and "vendor a" are the same vendor. */
function vendorName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function vendorEmails(): { map: Map<string, string[]>; problem: string | null } {
  const raw = process.env.VENDOR_EMAILS?.trim();
  const map = new Map<string, string[]>();
  if (!raw) return { map, problem: "VENDOR_EMAILS is not set — no vendor will be emailed." };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [name, value] of Object.entries(parsed)) {
      const list = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.includes("@"))
        : emailList(typeof value === "string" ? value : "");
      if (list.length > 0) map.set(vendorName(name), list);
    }
    return { map, problem: null };
  } catch {
    return { map, problem: "VENDOR_EMAILS is not valid JSON — no vendor will be emailed." };
  }
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

type Van = {
  id: string;
  van: string;
  vendor: string;
  vin: string;
  vendorNumber: string;
  expires: string;
};

/** The email, worded for whoever it is to. */
function compose(van: Van, daysLeft: number, audience: "office" | "vendor", vendorTo: string[]) {
  const when = daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
  const date = registrationLabel(van.expires);
  const subject = `Registration for van ${van.van} expires ${when} (${date})`;

  const facts: [string, string][] = [
    ["Van", van.van],
    ["Vendor", van.vendor || "—"],
    ["VIN", van.vin || "—"],
    ["Vendor #", van.vendorNumber || "—"],
    ["Registration expires", `${date} — ${when}`],
  ];

  const opening =
    audience === "vendor"
      ? `The registration for the van below expires ${when}, on ${date}. Please arrange the renewal and send the updated registration before then.`
      : `The registration for van ${van.van} expires ${when}, on ${date}.`;

  const closing =
    audience === "vendor"
      ? ""
      : van.vendor
        ? vendorTo.length > 0
          ? `The vendor (${van.vendor}) has been sent the same reminder at ${vendorTo.join(", ")}.`
          : `There is no email on file for the vendor "${van.vendor}", so they were not sent this reminder.`
        : "This van has no vendor in the vans database, so no vendor was sent this reminder.";

  const text = [
    opening,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    ...(closing ? ["", closing] : []),
  ].join("\n");

  const rows = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b6b6b;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;color:#1a1a1a">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">
<p style="margin:0 0 16px">${escapeHtml(opening)}</p>
<table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">${rows}</table>
${closing ? `<p style="margin:0;color:#6b6b6b;font-size:13px">${escapeHtml(closing)}</p>` : ""}
</div>`;

  return { subject, text, html };
}

export async function sendRegistrationReminders({
  dryRun = false,
}: { dryRun?: boolean } = {}): Promise<ReminderSummary> {
  const today = stationDateKey();
  const summary: ReminderSummary = {
    dryRun,
    today,
    sent: [],
    noVendorEmail: [],
    errors: [],
    config: [],
  };

  const office = emailList(process.env.REGISTRATION_EMAIL_TO);
  if (office.length === 0) {
    summary.config.push("REGISTRATION_EMAIL_TO is not set — the office will not be emailed.");
  }
  const vendors = vendorEmails();
  if (vendors.problem) summary.config.push(vendors.problem);
  const replyTo = emailList(process.env.REGISTRATION_EMAIL_REPLY_TO);

  const db = getAdminDb();
  const snapshot = await db.collection("vans").get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const string = (value: unknown) => (typeof value === "string" ? value : "");
    const van: Van = {
      id: doc.id,
      van: string(data.van),
      vendor: string(data.vendor).trim(),
      vin: string(data.vin),
      vendorNumber: string(data.vendorNumber),
      expires: string(data.registrationExpires),
    };
    if (!isRegistrationDate(van.expires)) continue;

    const daysLeft = daysUntil(van.expires, today);
    // Cheap check before any read: nothing is due outside the window.
    if (dueReminder(daysLeft, []) === null) continue;

    try {
      const noticeRef = db.collection(NOTICES).doc(`${van.id}_${van.expires}`);
      const noticeData = (await noticeRef.get()).data() ?? {};
      const notice: Notice = {
        office: numbers(noticeData.office),
        vendor: numbers(noticeData.vendor),
      };

      const vendorTo = van.vendor ? (vendors.map.get(vendorName(van.vendor)) ?? []) : [];
      const officeDue = office.length > 0 && dueReminder(daysLeft, notice.office) !== null;
      const vendorDue = dueReminder(daysLeft, notice.vendor) !== null;

      if (vendorDue && van.vendor && vendorTo.length === 0) {
        summary.noVendorEmail.push({ van: van.van, vendor: van.vendor });
      }

      const sends: { to: "office" | "vendor"; recipients: string[] }[] = [];
      if (vendorDue && vendorTo.length > 0) sends.push({ to: "vendor", recipients: vendorTo });
      if (officeDue) sends.push({ to: "office", recipients: office });

      for (const send of sends) {
        if (dryRun) {
          summary.sent.push({ van: van.van, daysLeft, ...send });
          continue;
        }
        try {
          await sendEmail({
            to: send.recipients,
            replyTo,
            ...compose(van, daysLeft, send.to, vendorTo),
            idempotencyKey: `registration-${van.id}-${van.expires}-${daysLeft}-${send.to}`,
          });
          notice[send.to] = markSent(daysLeft, notice[send.to]);
          await noticeRef.set(
            {
              van: van.van,
              expires: van.expires,
              [send.to]: notice[send.to],
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          summary.sent.push({ van: van.van, daysLeft, ...send });
        } catch (error) {
          summary.errors.push({
            van: van.van,
            to: send.to,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      summary.errors.push({
        van: van.van,
        to: "van",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
