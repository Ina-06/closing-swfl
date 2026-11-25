/**
 * Email, through Resend's HTTP API. Server only.
 *
 * Plain fetch rather than the SDK: one endpoint, one call, nothing to install.
 * RESEND_API_KEY is the key; the From address has to be on a domain verified
 * in Resend, or Resend refuses the send.
 *
 * https://resend.com/docs/api-reference/emails/send-email
 */

export type Email = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string[];
  /**
   * The same key twice within 24 hours sends once. A retried run cannot
   * email anybody twice for the same reminder.
   */
  idempotencyKey: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resend allows a couple of requests a second per account. Sends are spaced
 * at least this far apart, so a day with several vans due never trips it.
 */
const SPACING_MS = 600;
let lastSendAt = 0;

export async function sendEmail(email: Email): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REGISTRATION_EMAIL_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  if (!from) throw new Error("REGISTRATION_EMAIL_FROM is not set.");

  // Rate limited anyway: wait and try again, twice. The idempotency key
  // makes a retry safe even if the first attempt did get through.
  for (let attempt = 0; ; attempt++) {
    const gap = lastSendAt + SPACING_MS - Date.now();
    if (gap > 0) await wait(gap);
    lastSendAt = Date.now();

    const result = await post(apiKey, from, email);
    if (result.status === 429 && attempt < 2) {
      await wait(1500 * (attempt + 1));
      continue;
    }
    if (!result.ok) {
      throw new Error(`Resend refused the email (${result.status}): ${result.message}`);
    }
    return { id: result.id };
  }
}

async function post(apiKey: string, from: string, email: Email) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo && email.replyTo.length > 0 ? { reply_to: email.replyTo } : {}),
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  return {
    ok: response.ok,
    status: response.status,
    id: body.id ?? "",
    message: body.message ?? "no reason given",
  };
}

/** "a@x.com, b@y.com" → ["a@x.com", "b@y.com"]. Anything without an @ is dropped. */
export function emailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((address) => address.trim())
    .filter((address) => address.includes("@"));
}

/** Text for an HTML body. Van fields are typed by people, so never raw. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
